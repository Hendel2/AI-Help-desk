"""Assistente de TI — conversa do chatbot (§25–28, §46).

Com LLM, é uma conversa de suporte de verdade: o modelo recebe o histórico,
entende o problema, pergunta o que falta, propõe passos e usa a base de
conhecimento da empresa como reforço quando houver artigo relevante. Ele mesmo
indica quando a equipe precisa assumir (`escalate`) — só então o chat oferece
abrir um chamado, que é resumido pela IA. Saídas sempre estruturadas e
validadas; fontes inventadas são descartadas.

Sem LLM (ou se todos os provedores falharem), quem responde é o assistente
básico (`basic_assistant.py`), sobre a base de conhecimento.
"""

import json
import re
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.models.enums import TicketPriority
from app.services.ai.prompts import (
    BASE_SYSTEM_PROMPT,
    CHAT_SYSTEM_PROMPT,
    TICKET_SUMMARY_INSTRUCTIONS,
    wrap_user_text,
)
from app.services.ai.provider import ChatTurn, LLMProvider, LLMResult
from app.services.ai.rag import RetrievedSource

CREDENTIAL_WARNING = (
    "Por segurança, nunca compartilhe senhas, tokens ou códigos de verificação — nem comigo "
    "nem com a equipe de TI. Removi esse dado da conversa."
)

# "minha senha é X", "senha: X", "password = X", "token X"
_SECRET_PATTERN = re.compile(
    r"(?i)\b(senha|password|pass|token|codigo de verifica[cç][aã]o|código de verificação|pin)"
    r"(\s*(?:é|e|eh|:|=)\s*|\s+)(\S+)"
)


def redact_secrets(text: str) -> tuple[str, bool]:
    """Remove credenciais digitadas pelo usuário antes de gravar ou enviar à IA."""
    redacted, count = _SECRET_PATTERN.subn(lambda m: f"{m.group(1)}{m.group(2)}[removido]", text)
    return redacted, count > 0


@dataclass(frozen=True)
class AssistantReply:
    text: str
    sources: list[RetrievedSource]
    suggest_ticket: bool
    mode: Literal["llm", "heuristic"]
    llm: LLMResult | None = None
    #: Estado da conversa segundo a IA (só no modo LLM).
    status: str | None = None


ConversationStatus = Literal["troubleshooting", "resolved", "escalate"]
#: Turnos anteriores enviados ao modelo e tamanho máximo de cada um.
LLM_HISTORY_LIMIT = 12
LLM_TURN_CHARS = 2000


class _LLMChatReply(BaseModel):
    reply: str = Field(min_length=1, max_length=6000)
    status: ConversationStatus
    used_source_ids: list[int]


_CHAT_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "status": {"type": "string", "enum": ["troubleshooting", "resolved", "escalate"]},
        "used_source_ids": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["reply", "status", "used_source_ids"],
    "additionalProperties": False,
}


def _format_sources(sources: list[RetrievedSource]) -> str:
    return "\n\n".join(
        f'<fonte id="{source.article_id}" titulo="{source.title}">\n{source.excerpt}\n</fonte>'
        for source in sources
    )


def _history_turns(history: list[tuple[str, str]]) -> list[ChatTurn]:
    """Mensagens anteriores (USER/ASSISTANT) como turnos do modelo; SYSTEM fica de fora."""
    turns = [
        ChatTurn("user" if role == "USER" else "assistant", content[:LLM_TURN_CHARS])
        for role, content in history
        if role in ("USER", "ASSISTANT")
    ]
    return turns[-LLM_HISTORY_LIMIT:]


class InvalidAnswerError(Exception):
    pass


def converse_with_llm(
    provider: LLMProvider,
    message: str,
    history: list[tuple[str, str]],
    sources: list[RetrievedSource],
) -> AssistantReply:
    """Próxima resposta da conversa de suporte, com o histórico real de turnos.

    Sem trecho relacionado, o modelo recebe só a mensagem: nada de "nenhum artigo
    encontrado", que o induziria a falar da base em vez de resolver o problema.
    """
    content = wrap_user_text("mensagem_usuario", message)
    if sources:
        content += (
            "\n\nTrechos da base de conhecimento da empresa (use só se se aplicarem ao "
            "caso):\n" + _format_sources(sources)
        )
    result = provider.complete(
        system=CHAT_SYSTEM_PROMPT,
        user_content=content,
        history=_history_turns(history),
        max_tokens=4096,
        effort="medium",
        json_schema=_CHAT_SCHEMA,
    )
    try:
        parsed = _LLMChatReply.model_validate(json.loads(result.text))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise InvalidAnswerError("Resposta do assistente fora do formato.") from exc

    # Só fontes que o modelo realmente recebeu (ids inventados são descartados).
    by_id = {source.article_id: source for source in sources}
    used = [by_id[i] for i in dict.fromkeys(parsed.used_source_ids) if i in by_id]
    return AssistantReply(
        text=parsed.reply.strip(),
        sources=used,
        suggest_ticket=parsed.status == "escalate",
        mode="llm",
        llm=result,
        status=parsed.status,
    )


# --- Resumo da conversa para o chamado ---------------------------------------------


@dataclass(frozen=True)
class TicketDraft:
    title: str
    description: str
    category_name: str | None
    priority: TicketPriority
    llm: LLMResult


class _LLMTicket(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=10, max_length=8000)
    category: str
    priority: TicketPriority


def _ticket_schema() -> dict[str, object]:
    return {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "description": {"type": "string"},
            "category": {"type": "string"},
            "priority": {"type": "string", "enum": [p.value for p in TicketPriority]},
        },
        "required": ["title", "description", "category", "priority"],
        "additionalProperties": False,
    }


def summarize_for_ticket(
    provider: LLMProvider, transcript: str, categories: list[str]
) -> TicketDraft:
    """Título, descrição, categoria e prioridade do chamado a partir da conversa."""
    instructions = TICKET_SUMMARY_INSTRUCTIONS.format(
        categories=", ".join(categories) or "(nenhuma cadastrada)"
    )
    result = provider.complete(
        system=BASE_SYSTEM_PROMPT,
        user_content=f"{instructions}\n\n{wrap_user_text('conversa', transcript)}",
        max_tokens=2048,
        effort="low",
        json_schema=_ticket_schema(),
    )
    try:
        parsed = _LLMTicket.model_validate(json.loads(result.text))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise InvalidAnswerError("Resumo do chamado fora do formato.") from exc
    # Categoria inventada é descartada (só vale nome exato da empresa).
    category = parsed.category.strip()
    return TicketDraft(
        title=parsed.title.strip(),
        description=parsed.description.strip(),
        category_name=category if category in categories else None,
        priority=parsed.priority,
        llm=result,
    )
