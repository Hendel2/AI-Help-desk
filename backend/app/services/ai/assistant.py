"""Assistente de TI — geração de respostas do chatbot (§25–28, §46).

A resposta usa SOMENTE a base de conhecimento da empresa (RAG). Com LLM, a
saída é estruturada e validada: o modelo só pode citar fontes que recebeu.
Sem LLM (ou se ele falhar), responde com o trecho mais relevante encontrado.
Em ambos os casos, sem fonte suficiente o assistente é transparente e sugere
abrir um chamado (§26).
"""

import json
import re
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.services.ai.classifier import normalize
from app.services.ai.prompts import BASE_SYSTEM_PROMPT, wrap_user_text
from app.services.ai.provider import LLMProvider, LLMResult
from app.services.ai.rag import RetrievedSource

#: Quantas mensagens anteriores entram no contexto do LLM.
HISTORY_LIMIT = 8

NO_ANSWER_TEXT = (
    "Não consegui resolver esse problema com segurança com as informações da nossa base "
    "de conhecimento.\n\nDeseja abrir um chamado com a nossa equipe?"
)
CREDENTIAL_WARNING = (
    "Por segurança, nunca compartilhe senhas, tokens ou códigos de verificação — nem comigo "
    "nem com a equipe de TI. Removi esse dado da conversa."
)

# "minha senha é X", "senha: X", "password = X", "token X"
_SECRET_PATTERN = re.compile(
    r"(?i)\b(senha|password|pass|token|codigo de verifica[cç][aã]o|código de verificação|pin)"
    r"(\s*(?:é|e|eh|:|=)\s*|\s+)(\S+)"
)
_NOT_SOLVED = (
    "nao resolveu",
    "nao funcionou",
    "continua",
    "ainda nao",
    "nao deu certo",
    "mesmo erro",
    "nao ajudou",
)


def redact_secrets(text: str) -> tuple[str, bool]:
    """Remove credenciais digitadas pelo usuário antes de gravar ou enviar à IA."""
    redacted, count = _SECRET_PATTERN.subn(lambda m: f"{m.group(1)}{m.group(2)}[removido]", text)
    return redacted, count > 0


def says_not_solved(text: str) -> bool:
    normalized = normalize(text)
    return any(phrase in normalized for phrase in _NOT_SOLVED)


@dataclass(frozen=True)
class AssistantReply:
    text: str
    sources: list[RetrievedSource]
    suggest_ticket: bool
    mode: Literal["llm", "heuristic"]
    llm: LLMResult | None = None


class _LLMAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=6000)
    needs_human: bool
    used_source_ids: list[int]


_ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "needs_human": {"type": "boolean"},
        "used_source_ids": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["answer", "needs_human", "used_source_ids"],
    "additionalProperties": False,
}

_ANSWER_INSTRUCTIONS = """\
Responda à última mensagem do usuário usando SOMENTE as fontes da base de conhecimento \
abaixo. Regras:
- Se as fontes não forem suficientes, diga isso com clareza, não invente passos e \
marque needs_human = true.
- Marque needs_human = true também quando o problema exigir intervenção da equipe.
- Seja objetivo: passos numerados quando houver procedimento.
- used_source_ids: os ids das fontes que você realmente usou (pode ser vazio).
- Não mencione ids na resposta; a interface mostra as fontes.\
"""


def _format_sources(sources: list[RetrievedSource]) -> str:
    if not sources:
        return "(nenhuma fonte relevante encontrada)"
    return "\n\n".join(
        f'<fonte id="{source.article_id}" titulo="{source.title}">\n{source.excerpt}\n</fonte>'
        for source in sources
    )


def _format_history(history: list[tuple[str, str]]) -> str:
    lines = [
        f"{'Usuário' if role == 'USER' else 'Assistente'}: {content}"
        for role, content in history[-HISTORY_LIMIT:]
    ]
    return "\n".join(lines) or "(início da conversa)"


class InvalidAnswerError(Exception):
    pass


def answer_with_llm(
    provider: LLMProvider,
    question: str,
    history: list[tuple[str, str]],
    sources: list[RetrievedSource],
) -> AssistantReply:
    content = "\n\n".join(
        [
            _ANSWER_INSTRUCTIONS,
            "Fontes da base de conhecimento:\n" + _format_sources(sources),
            wrap_user_text("historico", _format_history(history)),
            wrap_user_text("mensagem_usuario", question),
        ]
    )
    result = provider.complete(
        system=BASE_SYSTEM_PROMPT,
        user_content=content,
        max_tokens=2048,
        effort="medium",
        json_schema=_ANSWER_SCHEMA,
    )
    try:
        parsed = _LLMAnswer.model_validate(json.loads(result.text))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise InvalidAnswerError("Resposta do assistente fora do formato.") from exc

    # Só fontes que o modelo realmente recebeu (ids inventados são descartados).
    by_id = {source.article_id: source for source in sources}
    used = [by_id[i] for i in dict.fromkeys(parsed.used_source_ids) if i in by_id]
    return AssistantReply(
        text=parsed.answer.strip(),
        sources=used,
        suggest_ticket=parsed.needs_human or not used,
        mode="llm",
        llm=result,
    )


def answer_heuristic(sources: list[RetrievedSource]) -> AssistantReply:
    if not sources:
        return AssistantReply(
            text=NO_ANSWER_TEXT, sources=[], suggest_ticket=True, mode="heuristic"
        )
    best = sources[0]
    text = (
        f"Encontrei na base de conhecimento um procedimento que pode ajudar — "
        f"“{best.title}”:\n\n{best.excerpt}\n\nIsso resolveu o seu problema?"
    )
    return AssistantReply(text=text, sources=[best], suggest_ticket=False, mode="heuristic")
