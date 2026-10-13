"""Orquestração do AI Copilot: permissão, contexto, LLM ou heurística e registro."""

import json
import logging
import time

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError
from app.models import AIAction, User
from app.models.enums import AIActionType
from app.services.ai.copilot import (
    CopilotAction,
    CopilotResult,
    InvalidCopilotOutputError,
    analyze_heuristic,
    response_heuristic,
    run_llm,
    suggest_heuristic,
    summarize_heuristic,
    ticket_context,
)
from app.services.ai.provider import AIProviderError, LLMProvider
from app.services.ai.rag import RAGService, RetrievedSource
from app.services.tickets import TicketService, is_staff

logger = logging.getLogger("app.ai.copilot")

ACTION_TYPES: dict[CopilotAction, AIActionType] = {
    "summarize": AIActionType.SUMMARIZE_TICKET,
    "suggest_solution": AIActionType.SUGGEST_SOLUTION,
    "generate_response": AIActionType.GENERATE_RESPONSE,
    "analyze_history": AIActionType.SUMMARIZE_TICKET,
}
#: Ações que consultam a base de conhecimento.
_USES_KNOWLEDGE: frozenset[CopilotAction] = frozenset({"suggest_solution", "generate_response"})


class CopilotService:
    def __init__(self, session: Session, provider: LLMProvider | None, rag: RAGService) -> None:
        self.session = session
        self.provider = provider
        self.rag = rag
        self.tickets = TicketService(session)

    def _require_staff(self, user: User) -> None:
        if not is_staff(user):
            raise ForbiddenError(
                "O AI Copilot é exclusivo da equipe de suporte.", code="COPILOT_FORBIDDEN"
            )

    def find_articles(self, user: User, ticket_id: int) -> list[RetrievedSource]:
        self._require_staff(user)
        ticket = self.tickets.get(user, ticket_id)  # escopo de empresa + 404
        started = time.perf_counter()
        sources = self.rag.search(user.company_id, f"{ticket.title}\n{ticket.description}", k=5)
        self._log(
            user,
            AIActionType.RAG_SEARCH,
            f"ticket:{ticket.id}",
            {"sources": [s.article_id for s in sources]},
            model="heuristic",
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        self.session.commit()
        return sources

    def run(self, user: User, ticket_id: int, action: CopilotAction) -> CopilotResult:
        self._require_staff(user)
        ticket = self.tickets.get(user, ticket_id)
        # Rascunho para o usuário nunca vê notas internas (evita vazamento).
        internal = action != "generate_response"
        comments = list(self.tickets.comments.list_for_ticket(ticket.id, include_internal=internal))
        history = list(self.tickets.history.list_for_ticket(ticket.id, include_internal=internal))
        sources = (
            self.rag.search(user.company_id, f"{ticket.title}\n{ticket.description}", k=4)
            if action in _USES_KNOWLEDGE
            else []
        )
        reference = f"ticket:{ticket.id}:{action}"

        if self.provider is not None:
            started = time.perf_counter()
            context = ticket_context(ticket, comments, history, include_internal=internal)
            try:
                result = run_llm(self.provider, action, context, sources)
                self._log_result(user, action, reference, result)
                self.session.commit()
                return result
            except (AIProviderError, InvalidCopilotOutputError) as exc:
                logger.warning(
                    "Copilot por LLM falhou; usando heurística", extra={"error": str(exc)}
                )
                self._log(
                    user,
                    ACTION_TYPES[action],
                    reference,
                    None,
                    model=self.provider.model,
                    success=False,
                    error=str(exc),
                    latency_ms=int((time.perf_counter() - started) * 1000),
                )

        started = time.perf_counter()
        if action == "summarize":
            result = summarize_heuristic(ticket, comments)
        elif action == "suggest_solution":
            result = suggest_heuristic(sources)
        elif action == "generate_response":
            result = response_heuristic(ticket, sources)
        else:
            result = analyze_heuristic(ticket, history)
        self._log_result(
            user, action, reference, result, latency_ms=int((time.perf_counter() - started) * 1000)
        )
        self.session.commit()
        return result

    def _log_result(
        self,
        user: User,
        action: CopilotAction,
        reference: str,
        result: CopilotResult,
        *,
        latency_ms: int | None = None,
    ) -> None:
        llm = result.llm
        self._log(
            user,
            ACTION_TYPES[action],
            reference,
            {
                "mode": result.mode,
                "sources": [s.article_id for s in result.sources],
                "chars": len(result.text),
            },
            model=llm.model if llm else "heuristic",
            latency_ms=llm.latency_ms if llm else latency_ms,
            input_tokens=llm.input_tokens if llm else None,
            output_tokens=llm.output_tokens if llm else None,
        )

    def _log(
        self,
        user: User,
        action_type: AIActionType,
        reference: str,
        output: dict[str, object] | None,
        *,
        model: str,
        success: bool = True,
        error: str | None = None,
        latency_ms: int | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
    ) -> None:
        self.session.add(
            AIAction(
                company_id=user.company_id,
                user_id=user.id,
                action_type=action_type,
                input_reference=reference[:100],
                output=json.dumps(output) if output is not None else None,
                model=model,
                success=success,
                error_message=error[:500] if error else None,
                latency_ms=latency_ms,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        )
        self.session.flush()
