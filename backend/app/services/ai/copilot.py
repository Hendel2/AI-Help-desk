"""AI Copilot do técnico (§30, §44).

Ações: resumir, sugerir solução, encontrar artigos, gerar resposta e analisar
histórico. Regras (skill ai-helpdesk):
- tudo é SUGESTÃO para o técnico revisar — nada é enviado ao usuário daqui;
- a resposta ao usuário é gerada SEM comentários internos no contexto, para
  que informação interna não vaze para o rascunho;
- com LLM, a saída é estruturada e só pode citar fontes que recebeu;
- sem LLM (ou se falhar), cada ação tem uma versão determinística útil.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.models import Ticket, TicketComment, TicketHistory
from app.models.enums import TicketHistoryAction
from app.models.types import utcnow
from app.services import sla
from app.services.ai.prompts import BASE_SYSTEM_PROMPT, wrap_user_text
from app.services.ai.provider import LLMProvider, LLMResult
from app.services.ai.rag import RetrievedSource

CopilotAction = Literal["summarize", "suggest_solution", "generate_response", "analyze_history"]

STATUS_PT = {
    "OPEN": "aberto",
    "TRIAGE": "em triagem",
    "ASSIGNED": "atribuído",
    "IN_PROGRESS": "em andamento",
    "WAITING_USER": "aguardando o usuário",
    "RESOLVED": "resolvido",
    "CLOSED": "fechado",
    "CANCELLED": "cancelado",
}
PRIORITY_PT = {"LOW": "baixa", "MEDIUM": "média", "HIGH": "alta", "CRITICAL": "crítica"}


@dataclass(frozen=True)
class CopilotResult:
    text: str
    sources: list[RetrievedSource] = field(default_factory=list)
    mode: Literal["llm", "heuristic"] = "heuristic"
    llm: LLMResult | None = None


class InvalidCopilotOutputError(Exception):
    pass


class _Structured(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    used_source_ids: list[int]


_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "used_source_ids": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["text", "used_source_ids"],
    "additionalProperties": False,
}

_INSTRUCTIONS: dict[CopilotAction, str] = {
    "summarize": (
        "Você auxilia um técnico de suporte. Resuma o chamado em até 5 linhas: o problema, "
        "o impacto, o que já foi feito e o que falta. Não invente fatos."
    ),
    "suggest_solution": (
        "Você auxilia um técnico de suporte. Sugira as causas mais prováveis (lista numerada) "
        "e os passos de solução, priorizando os procedimentos das fontes da base de "
        "conhecimento. Se as fontes não cobrirem o caso, diga isso e proponha um diagnóstico."
    ),
    "generate_response": (
        "Escreva um rascunho de resposta do técnico para o USUÁRIO do chamado: cordial, "
        "objetivo, em português do Brasil, com os passos que o usuário pode executar. Use "
        "as fontes quando aplicável. Nunca peça senhas. Não prometa prazos. O técnico vai "
        "revisar antes de enviar."
    ),
    "analyze_history": (
        "Você auxilia um técnico de suporte. Analise a linha do tempo do chamado: tempo em "
        "cada etapa, reaberturas, esperas pelo usuário, risco de SLA e recomende o próximo "
        "passo. Seja objetivo (até 8 linhas)."
    ),
}


def _age(start: datetime, now: datetime) -> str:
    minutes = int((now - start).total_seconds() // 60)
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    if hours < 48:
        return f"{hours} h"
    return f"{hours // 24} dias"


def ticket_context(
    ticket: Ticket,
    comments: list[TicketComment],
    history: list[TicketHistory],
    *,
    include_internal: bool,
) -> str:
    """Texto do chamado para a IA. Comentários internos só quando permitido."""
    lines = [
        f"Número: {ticket.ticket_number}",
        f"Título: {ticket.title}",
        f"Status: {STATUS_PT.get(ticket.status.value, ticket.status.value)}",
        f"Prioridade: {PRIORITY_PT.get(ticket.priority.value, ticket.priority.value)}",
        f"Categoria: {ticket.category.name if ticket.category else 'sem categoria'}",
        f"Aberto em: {ticket.created_at:%d/%m/%Y %H:%M} (UTC)",
        "",
        "Descrição:",
        ticket.description,
    ]
    visible = [c for c in comments if include_internal or not c.is_internal]
    if visible:
        lines += ["", "Comentários:"]
        for comment in visible:
            tag = " (interno)" if comment.is_internal else ""
            lines.append(f"- {comment.author.name}{tag}: {comment.content}")
    if history:
        lines += ["", "Histórico:"]
        for entry in history:
            change = f": {entry.old_value} → {entry.new_value}" if entry.new_value else ""
            lines.append(f"- {entry.created_at:%d/%m %H:%M} {entry.action.value}{change}")
    return "\n".join(lines)


def run_llm(
    provider: LLMProvider,
    action: CopilotAction,
    context: str,
    sources: list[RetrievedSource],
) -> CopilotResult:
    source_block = (
        "\n\n".join(
            f'<fonte id="{s.article_id}" titulo="{s.title}">\n{s.excerpt}\n</fonte>'
            for s in sources
        )
        or "(nenhuma fonte relevante encontrada)"
    )
    content = "\n\n".join(
        [
            _INSTRUCTIONS[action],
            "Fontes da base de conhecimento:\n" + source_block,
            wrap_user_text("chamado", context),
            "Responda em `text`; liste em `used_source_ids` os ids das fontes usadas.",
        ]
    )
    result = provider.complete(
        system=BASE_SYSTEM_PROMPT,
        user_content=content,
        max_tokens=4096,
        effort="medium",
        json_schema=_SCHEMA,
    )
    try:
        parsed = _Structured.model_validate(json.loads(result.text))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise InvalidCopilotOutputError("Resposta do Copilot fora do formato.") from exc
    by_id = {s.article_id: s for s in sources}
    used = [by_id[i] for i in dict.fromkeys(parsed.used_source_ids) if i in by_id]
    return CopilotResult(text=parsed.text.strip(), sources=used, mode="llm", llm=result)


# --- Versões determinísticas (sem LLM) ---------------------------------------


def summarize_heuristic(ticket: Ticket, comments: list[TicketComment]) -> CopilotResult:
    now = utcnow()
    description = " ".join(ticket.description.split())
    if len(description) > 280:
        description = description[:277].rstrip() + "..."
    parts = [
        f"{ticket.requester.name} relatou há {_age(ticket.created_at, now)}: {description}",
        (
            f"Status {STATUS_PT.get(ticket.status.value)}, prioridade "
            f"{PRIORITY_PT.get(ticket.priority.value)}"
            + (f", com {ticket.technician.name}." if ticket.technician else ", sem técnico.")
        ),
    ]
    public = [c for c in comments if not c.is_internal]
    if public:
        last = public[-1]
        parts.append(f"Última mensagem ({last.author.name}): {last.content[:200]}")
    else:
        parts.append("Ainda não há respostas ao usuário.")
    return CopilotResult(text="\n\n".join(parts))


def suggest_heuristic(sources: list[RetrievedSource]) -> CopilotResult:
    if not sources:
        return CopilotResult(
            text=(
                "Não encontrei procedimentos na base de conhecimento para este caso. "
                "Sugestão: confirme com o usuário o erro exato, o horário e se afeta outras "
                "pessoas antes de avançar no diagnóstico."
            )
        )
    best = sources[0]
    return CopilotResult(
        text=f"Procedimento sugerido (de “{best.title}”):\n\n{best.excerpt}",
        sources=[best],  # cita só o artigo usado; "Encontrar artigos" lista os demais
    )


def response_heuristic(ticket: Ticket, sources: list[RetrievedSource]) -> CopilotResult:
    first_name = ticket.requester.name.split(" ")[0]
    if sources:
        body = (
            "Analisamos o seu chamado. Por favor, siga os passos abaixo:\n\n"
            f"{sources[0].excerpt}\n\n"
            "Se o problema continuar, responda por aqui que seguimos com o atendimento."
        )
    else:
        body = (
            "Recebemos o seu chamado e já estamos analisando. Para agilizar, pode nos informar "
            "a mensagem de erro exata e desde quando o problema acontece?"
        )
    return CopilotResult(
        text=f"Olá, {first_name}!\n\n{body}\n\nAtenciosamente,\nEquipe de TI",
        sources=sources[:1],
    )


def analyze_heuristic(ticket: Ticket, history: list[TicketHistory]) -> CopilotResult:
    now = utcnow()
    info = sla.evaluate(ticket, now=now)
    reopenings = sum(1 for h in history if h.action is TicketHistoryAction.REOPENED)
    waiting = sum(1 for h in history if h.field == "status" and h.new_value == "WAITING_USER")
    status_changes = [h for h in history if h.field == "status"]
    age = _age(ticket.created_at, now)
    lines = [
        f"Aberto há {age}, com {len(status_changes)} mudança(s) de status.",
        f"Reaberturas: {reopenings}. Vezes aguardando o usuário: {waiting}.",
    ]
    if info.status is not None:
        state = {"ON_TIME": "no prazo", "WARNING": "próximo do vencimento", "BREACHED": "vencido"}
        lines.append(f"SLA: {state[info.status.value]}.")
    if ticket.first_response_at is None and ticket.status.value not in (
        "RESOLVED",
        "CLOSED",
        "CANCELLED",
    ):
        lines.append("Próximo passo: o usuário ainda não recebeu resposta — responda primeiro.")
    elif reopenings:
        lines.append(
            "Próximo passo: o chamado já foi reaberto; confirme a causa raiz antes de resolver."
        )
    elif ticket.status.value == "WAITING_USER":
        lines.append(
            "Próximo passo: aguardando o usuário; considere um lembrete se passar de 1 dia."
        )
    else:
        lines.append("Próximo passo: siga com o diagnóstico e registre a solução ao resolver.")
    return CopilotResult(text="\n".join(lines))
