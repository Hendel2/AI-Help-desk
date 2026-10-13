"""Conversas com o Assistente de TI (§25, §26, §70).

Fluxo de cada mensagem:
1. credenciais digitadas são removidas antes de gravar/enviar à IA (§31);
2. a intenção é classificada (§27);
3. status de chamado → resposta com dados reais do usuário (sem IA);
   pedido de chamado ou "não resolveu" → sugere escalar;
   demais → RAG + resposta (LLM ou heurística), sempre com fontes;
4. tudo é registrado: mensagens, `ai_actions` (§69) e, na escalada, o chamado
   com `source=CHATBOT` (§65).
"""

import json
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models import AIAction, AIFeedback, Conversation, Message, Ticket, User
from app.models.enums import (
    AIActionType,
    AIFeedbackRating,
    ChatIntent,
    ConversationStatus,
    MessageRole,
    TicketSource,
)
from app.repositories.dashboard import ACTIVE_STATUSES
from app.schemas.ticket import TicketCreate
from app.services.ai.assistant import (
    CREDENTIAL_WARNING,
    AssistantReply,
    InvalidAnswerError,
    answer_heuristic,
    answer_with_llm,
    redact_secrets,
    says_not_solved,
)
from app.services.ai.provider import AIProviderError, LLMProvider
from app.services.ai.rag import RAGService
from app.services.ai.service import AIService
from app.services.tickets import TicketService

logger = logging.getLogger("app.chat")

STATUS_LABELS = {
    "OPEN": "aberto",
    "TRIAGE": "em triagem",
    "ASSIGNED": "atribuído",
    "IN_PROGRESS": "em andamento",
    "WAITING_USER": "aguardando você",
}


@dataclass(frozen=True)
class ChatTurn:
    user_message: Message
    assistant_message: Message


class ChatService:
    def __init__(self, session: Session, provider: LLMProvider | None, rag: RAGService) -> None:
        self.session = session
        self.provider = provider
        self.rag = rag
        self.ai = AIService(session, provider)

    # --- Conversas ----------------------------------------------------------

    def create(self, user: User) -> Conversation:
        conversation = Conversation(company_id=user.company_id, user_id=user.id)
        self.session.add(conversation)
        self.session.commit()
        return self.get(user, conversation.id)

    def list(self, user: User, *, limit: int = 30) -> Sequence[Conversation]:
        return self.session.scalars(
            select(Conversation)
            .where(Conversation.company_id == user.company_id, Conversation.user_id == user.id)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
            .limit(limit)
        ).all()

    def get(self, user: User, conversation_id: int) -> Conversation:
        """Somente o dono vê a conversa (outra pessoa ou empresa → 404)."""
        conversation = self.session.scalars(
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.company_id == user.company_id,
                Conversation.user_id == user.id,
            )
            .options(selectinload(Conversation.messages))
            .execution_options(populate_existing=True)
        ).one_or_none()
        if conversation is None:
            raise NotFoundError("Conversa não encontrada.", code="CONVERSATION_NOT_FOUND")
        return conversation

    # --- Mensagens ----------------------------------------------------------

    def send(self, user: User, conversation_id: int, content: str) -> ChatTurn:
        conversation = self.get(user, conversation_id)
        if conversation.status is not ConversationStatus.ACTIVE:
            raise ConflictError(
                "Esta conversa foi encerrada. Inicie uma nova conversa.",
                code="CONVERSATION_CLOSED",
            )

        text, had_secret = redact_secrets(content.strip())
        history = [(m.role.value, m.content) for m in conversation.messages]
        classification = self.ai.classify(
            user, text, input_reference=f"conversation:{conversation.id}"
        ).classification

        user_message = Message(
            conversation_id=conversation.id,
            role=MessageRole.USER,
            content=text,
            intent=classification.intent,
            confidence=classification.confidence,
        )
        self.session.add(user_message)
        if conversation.title is None:
            conversation.title = text[:200]

        reply = self._reply(user, conversation, text, classification.intent, history)
        reply_text = f"{CREDENTIAL_WARNING}\n\n{reply.text}" if had_secret else reply.text
        assistant_message = Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content=reply_text,
            sources=[{"article_id": s.article_id, "title": s.title} for s in reply.sources],
            suggest_ticket=reply.suggest_ticket,
        )
        self.session.add(assistant_message)
        conversation.updated_at = assistant_message.created_at or conversation.updated_at
        self.session.commit()
        self.session.refresh(user_message)
        self.session.refresh(assistant_message)
        return ChatTurn(user_message=user_message, assistant_message=assistant_message)

    def _reply(
        self,
        user: User,
        conversation: Conversation,
        text: str,
        intent: ChatIntent,
        history: list[tuple[str, str]],
    ) -> AssistantReply:
        if intent is ChatIntent.TICKET_STATUS:
            return self._ticket_status(user)
        if intent is ChatIntent.CREATE_TICKET or (history and says_not_solved(text)):
            return AssistantReply(
                text=(
                    "Entendi. Posso abrir um chamado com a nossa equipe usando o que você "
                    "descreveu nesta conversa. Deseja abrir agora?"
                ),
                sources=[],
                suggest_ticket=True,
                mode="heuristic",
            )

        started = time.perf_counter()
        sources = self.rag.search(user.company_id, text)
        reference = f"conversation:{conversation.id}"
        if self.provider is not None:
            try:
                reply = answer_with_llm(self.provider, text, history, sources)
                self._log(user, reference, reply, success=True)
                return reply
            except (AIProviderError, InvalidAnswerError) as exc:
                logger.warning(
                    "Resposta por LLM falhou; usando heurística", extra={"error": str(exc)}
                )
                self._log(
                    user,
                    reference,
                    None,
                    success=False,
                    error=str(exc),
                    latency_ms=int((time.perf_counter() - started) * 1000),
                )
        reply = answer_heuristic(sources)
        self._log(
            user,
            reference,
            reply,
            success=True,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return reply

    def _ticket_status(self, user: User) -> AssistantReply:
        tickets = self.session.scalars(
            select(Ticket)
            .where(
                Ticket.company_id == user.company_id,
                Ticket.user_id == user.id,
                Ticket.status.in_(ACTIVE_STATUSES),
            )
            .order_by(Ticket.created_at.desc())
            .limit(5)
        ).all()
        if not tickets:
            text = "Você não tem chamados em aberto no momento."
        else:
            lines = [
                f"• {ticket.ticket_number} — {ticket.title} "
                f"({STATUS_LABELS.get(ticket.status.value, ticket.status.value)})"
                for ticket in tickets
            ]
            text = "Estes são os seus chamados em aberto:\n\n" + "\n".join(lines)
        return AssistantReply(text=text, sources=[], suggest_ticket=False, mode="heuristic")

    # --- Desfechos ----------------------------------------------------------

    def escalate(self, user: User, conversation_id: int) -> Ticket:
        """Abre um chamado a partir da conversa (§26: "Escala → Criar chamado")."""
        conversation = self.get(user, conversation_id)
        if conversation.status is ConversationStatus.ESCALATED and conversation.ticket_id:
            raise ConflictError(
                "Esta conversa já gerou um chamado.", code="CONVERSATION_ALREADY_ESCALATED"
            )
        user_messages = [m.content for m in conversation.messages if m.role is MessageRole.USER]
        if not user_messages:
            raise ConflictError(
                "Descreva o problema antes de abrir um chamado.", code="CONVERSATION_EMPTY"
            )

        first = user_messages[0]
        title = first if len(first) <= 120 else first[:117].rstrip() + "..."
        title = title if len(title) >= 5 else f"Solicitação: {title}"
        transcript = "\n".join(
            f"{'Usuário' if m.role is MessageRole.USER else 'Assistente'}: {m.content}"
            for m in conversation.messages
            if m.role is not MessageRole.SYSTEM
        )
        description = (
            "Chamado aberto pelo Assistente de TI após a conversa abaixo.\n\n" + transcript
        )[:20_000]
        classification = self.ai.classify(
            user, "\n".join(user_messages), input_reference=f"conversation:{conversation.id}"
        )
        ticket = TicketService(self.session).create(
            user,
            TicketCreate(
                title=title,
                description=description if len(description) >= 10 else f"{description} (chat)",
                category_id=classification.category.id if classification.category else None,
                priority=classification.classification.priority,
            ),
            source=TicketSource.CHATBOT,
        )
        conversation = self.get(user, conversation_id)
        conversation.status = ConversationStatus.ESCALATED
        conversation.ticket_id = ticket.id
        self.session.add(
            Message(
                conversation_id=conversation.id,
                role=MessageRole.SYSTEM,
                content=(
                    f"Chamado {ticket.ticket_number} aberto. "
                    "A equipe de suporte vai responder por lá."
                ),
            )
        )
        self.session.commit()
        return ticket

    def resolve(self, user: User, conversation_id: int) -> Conversation:
        conversation = self.get(user, conversation_id)
        if conversation.status is ConversationStatus.ACTIVE:
            conversation.status = ConversationStatus.RESOLVED
            self.session.commit()
        return self.get(user, conversation_id)

    def feedback(
        self, user: User, message_id: int, rating: AIFeedbackRating, text: str | None
    ) -> AIFeedback:
        message = self.session.scalars(
            select(Message)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                Message.id == message_id,
                Message.role == MessageRole.ASSISTANT,
                Conversation.company_id == user.company_id,
                Conversation.user_id == user.id,
            )
        ).one_or_none()
        if message is None:
            raise NotFoundError("Mensagem não encontrada.", code="MESSAGE_NOT_FOUND")
        feedback = AIFeedback(
            company_id=user.company_id,
            user_id=user.id,
            message_id=message.id,
            rating=rating,
            feedback_text=text,
        )
        self.session.add(feedback)
        self.session.commit()
        return feedback

    # --- Registro (§69, §71) -------------------------------------------------

    def _log(
        self,
        user: User,
        reference: str,
        reply: AssistantReply | None,
        *,
        success: bool,
        error: str | None = None,
        latency_ms: int | None = None,
    ) -> None:
        llm = reply.llm if reply else None
        self.session.add(
            AIAction(
                company_id=user.company_id,
                user_id=user.id,
                action_type=AIActionType.CHAT_RESPONSE,
                input_reference=reference[:100],
                # Só metadados da resposta: fontes e se escalou (sem o texto do usuário).
                output=json.dumps(
                    {
                        "mode": reply.mode,
                        "sources": [s.article_id for s in reply.sources],
                        "suggest_ticket": reply.suggest_ticket,
                    }
                )
                if reply
                else None,
                model=llm.model
                if llm
                else (self.provider.model if (self.provider and not success) else "heuristic"),
                success=success,
                error_message=error[:500] if error else None,
                latency_ms=llm.latency_ms if llm else latency_ms,
                input_tokens=llm.input_tokens if llm else None,
                output_tokens=llm.output_tokens if llm else None,
            )
        )
        self.session.flush()
