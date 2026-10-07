"""Classificação de chamados (§27): intenção, categoria e prioridade.

Duas implementações com a mesma saída validada:
- LLM (quando há provedor): saída estruturada em JSON, validada com Pydantic;
- heurística por palavras-chave (sem provedor ou se o LLM falhar).

O backend sempre valida o resultado (§27: "nunca confiar cegamente no JSON da
IA"): categoria inexistente na empresa é descartada e a confiança é limitada.
"""

import json
import re
import unicodedata
from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.models.enums import ChatIntent, TicketPriority
from app.services.ai.prompts import (
    BASE_SYSTEM_PROMPT,
    CLASSIFY_INSTRUCTIONS,
    classification_schema,
    wrap_user_text,
)
from app.services.ai.provider import LLMProvider, LLMResult

INTENTS = [intent.value for intent in ChatIntent]


class RawClassification(BaseModel):
    """Formato exigido da resposta do LLM — qualquer desvio é rejeitado."""

    intent: ChatIntent
    category: str = Field(max_length=100)
    priority: TicketPriority
    confidence: float

    @field_validator("confidence")
    @classmethod
    def _clamp(cls, value: float) -> float:
        return min(max(value, 0.0), 1.0)


class Classification(BaseModel):
    intent: ChatIntent
    category_name: str | None
    priority: TicketPriority
    confidence: float
    source: Literal["llm", "heuristic"]


def normalize(text: str) -> str:
    """Minúsculas e sem acentos, para comparar nomes e palavras-chave."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def match_category(name: str | None, categories: Sequence[str]) -> str | None:
    """Nome exato de uma categoria da empresa equivalente a `name` (ou None)."""
    if not name:
        return None
    wanted = normalize(name).strip()
    for category in categories:
        if normalize(category).strip() == wanted:
            return category
    return None


# --- Heurística -------------------------------------------------------------

# (intenção, palavras-chave sem acento, categoria sugerida). Ordem = prioridade de desempate.
_RULES: list[tuple[ChatIntent, tuple[str, ...], str | None]] = [
    (ChatIntent.VPN_PROBLEM, ("vpn", "forticlient", "anyconnect", "acesso remoto"), "VPN"),
    (
        ChatIntent.PASSWORD_RESET,
        ("senha", "password", "redefinir", "resetar", "expirad", "bloquead"),
        "Acesso",
    ),
    (
        ChatIntent.EMAIL_PROBLEM,
        ("e-mail", "email", "outlook", "caixa de entrada", "anexo nao", "spam"),
        "E-mail",
    ),
    (
        ChatIntent.PRINTER_PROBLEM,
        ("impressora", "imprimir", "impressao", "toner", "papel atol", "scanner"),
        "Impressora",
    ),
    (
        ChatIntent.NETWORK_PROBLEM,
        ("internet", "rede", "wi-fi", "wifi", "conexao", "lenta", "sem sinal", "cabo"),
        "Rede",
    ),
    (
        ChatIntent.SYSTEM_ACCESS,
        ("acesso", "permissao", "login", "pasta", "liberar", "perfil de acesso"),
        "Acesso",
    ),
    (
        ChatIntent.HARDWARE_PROBLEM,
        ("notebook", "computador", "monitor", "teclado", "mouse", "nao liga", "bateria", "tela"),
        "Hardware",
    ),
    (
        ChatIntent.SOFTWARE_PROBLEM,
        ("excel", "word", "instalar", "programa", "software", "aplicativo", "travando", "erro ao"),
        "Software",
    ),
    (ChatIntent.TICKET_STATUS, ("status do chamado", "meu chamado", "andamento do chamado"), None),
    (ChatIntent.CREATE_TICKET, ("abrir chamado", "abrir um chamado", "falar com o suporte"), None),
]

_CRITICAL_WORDS = (
    "todos os usuarios",
    "ninguem consegue",
    "empresa toda",
    "producao parada",
    "sistema fora do ar",
)
_HIGH_WORDS = (
    "urgente",
    "parado",
    "nao consigo trabalhar",
    "cliente",
    "reuniao agora",
    "nota fiscal",
)


def _keyword_hits(text: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if re.search(rf"\b{re.escape(keyword)}", text))


def classify_heuristic(
    text: str, categories: Sequence[str], default_priorities: dict[str, TicketPriority]
) -> Classification:
    normalized = normalize(text)
    best: tuple[int, ChatIntent, str | None] | None = None
    for intent, keywords, category in _RULES:
        hits = _keyword_hits(normalized, keywords)
        if hits and (best is None or hits > best[0]):
            best = (hits, intent, category)

    if best is None:
        intent, category_hint, hits = ChatIntent.GENERAL_QUESTION, None, 0
    else:
        hits, intent, category_hint = best
    category = match_category(category_hint, categories)

    if any(word in normalized for word in _CRITICAL_WORDS):
        priority = TicketPriority.CRITICAL
    elif any(word in normalized for word in _HIGH_WORDS):
        priority = TicketPriority.HIGH
    else:
        priority = default_priorities.get(category or "", TicketPriority.MEDIUM)

    confidence = 0.3 if hits == 0 else min(0.5 + 0.15 * hits, 0.85)
    return Classification(
        intent=intent,
        category_name=category,
        priority=priority,
        confidence=round(confidence, 2),
        source="heuristic",
    )


# --- LLM --------------------------------------------------------------------


class InvalidAIOutputError(Exception):
    """A resposta do LLM não seguiu o formato exigido."""


def classify_with_llm(
    provider: LLMProvider, text: str, categories: Sequence[str]
) -> tuple[Classification, LLMResult]:
    instructions = CLASSIFY_INSTRUCTIONS.format(
        intents=", ".join(INTENTS),
        categories=", ".join(categories) if categories else "(nenhuma cadastrada)",
    )
    result = provider.complete(
        system=BASE_SYSTEM_PROMPT,
        user_content=f"{instructions}\n\n{wrap_user_text('chamado', text)}",
        max_tokens=1024,
        effort="low",
        json_schema=classification_schema(INTENTS),
    )
    try:
        raw = RawClassification.model_validate(json.loads(result.text))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise InvalidAIOutputError("Classificação fora do formato esperado.") from exc

    return (
        Classification(
            intent=raw.intent,
            # Categoria "inventada" pela IA é descartada (§27).
            category_name=match_category(raw.category, categories),
            priority=raw.priority,
            confidence=round(raw.confidence, 2),
            source="llm",
        ),
        result,
    )
