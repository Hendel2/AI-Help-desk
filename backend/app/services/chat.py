"""Conversas com o Assistente de TI (§25, §26, §70).

Fluxo de cada mensagem:
1. credenciais digitadas são removidas antes de gravar/enviar à IA (§31);
2. a intenção é classificada (§27);
3. status de chamado → resposta com dados reais do usuário (sem IA);
   com IA → conversa de suporte com histórico, usando a base como reforço;
   sem IA (ou se todos os provedores falharem) → assistente básico sobre a base
   de conhecimento, com passo a passo (`basic_assistant.py`);
4. tudo é registrado: mensagens, `ai_actions` (§69) e, na escalada, o chamado
   com `source=CHATBOT` (§65).
"""

# As classes têm um método `list`: sem isto, no Python < 3.14 as anotações
# `list[...]` seguintes seriam resolvidas como o método, não como o tipo.
from __future__ import annotations

import json
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

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
from app.repositories.chat import ConversationRepository
from app.repositories.knowledge import KnowledgeArticleRepository
from app.repositories.ticket import CategoryRepository, TicketRepository
from app.schemas.ticket import TicketCreate
from app.services.ai.assistant import (
    CREDENTIAL_WARNING,
    AssistantReply,
    InvalidAnswerError,
    TicketDraft,
    converse_with_llm,
    redact_secrets,
    summarize_for_ticket,
)
from app.services.ai.basic_assistant import (
    ArticleText,
    BasicAssistant,
    PastMessage,
    first_problem,
)
from app.services.ai.provider import (
    AIProviderError,
    FallbackProvider,
    LLMProvider,
    OllamaProvider,
)
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
        self.conversations = ConversationRepository(session)
        self.tickets = TicketRepository(session)

    @property
    def ai_enabled(self) -> bool:
        """Há um provedor de IA; sem ele, responde o assistente básico (base de conhecimento)."""
        return self.provider is not None

    @property
    def slow_responses(self) -> bool:
        """A IA principal é a local (processador): a tela avisa que a resposta demora."""
        provider = self.provider
        if isinstance(provider, FallbackProvider):
            provider = provider.primary
        return isinstance(provider, OllamaProvider)

    # --- Conversas ----------------------------------------------------------

    def create(self, user: User) -> Conversation:
        conversation = Conversation(company_id=user.company_id, user_id=user.id)
        self.session.add(conversation)
        self.session.commit()
        return self.get(user, conversation.id)

    def list(self, user: User, *, limit: int = 30) -> Sequence[Conversation]:
        return self.conversations.list_for_user(user.company_id, user.id, limit=limit)

    def get(self, user: User, conversation_id: int) -> Conversation:
        """Somente o dono vê a conversa (outra pessoa ou empresa → 404)."""
        conversation = self.conversations.get_for_user(user.company_id, user.id, conversation_id)
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
        history = [
            PastMessage(m.role.value, m.content, tuple(s["article_id"] for s in m.sources or []))
            for m in conversation.messages
        ]
        # Intenção pela heurística local (sem custo): a chamada de IA fica para a resposta.
        classification = self.ai.classify(
            user, text, input_reference=f"conversation:{conversation.id}", use_llm=False
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
        history: list[PastMessage],
    ) -> AssistantReply:
        if intent is ChatIntent.TICKET_STATUS:
            return self._ticket_status(user)

        reference = f"conversation:{conversation.id}"
        if self.provider is not None:
            # Conversa de suporte de verdade: a IA decide quando a equipe precisa assumir.
            started = time.perf_counter()
            sources = self.rag.search(user.company_id, _search_query(text, history))
            turns = [(m.role, m.content) for m in history]
            try:
                reply = converse_with_llm(self.provider, text, turns, sources)
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

        # Sem IA (ou se todos os provedores falharem): assistente básico sobre a base.
        started = time.perf_counter()
        reply = self._basic_assistant(user).reply(text, intent, history)
        self._log(
            user,
            reference,
            reply,
            success=True,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return reply

    def _basic_assistant(self, user: User) -> BasicAssistant:
        """Assistente sem IA, preso à empresa do usuário (busca e artigos publicados)."""
        articles = KnowledgeArticleRepository(self.session)

        def load_article(article_id: int) -> ArticleText | None:
            article = articles.get(user.company_id, article_id, published_only=True)
            return ArticleText(article.id, article.title, article.content) if article else None

        return BasicAssistant(
            search=lambda query: self.rag.search(user.company_id, query),
            load_article=load_article,
        )

    def _ticket_status(self, user: User) -> AssistantReply:
        tickets = self.tickets.active_for_requester(user.company_id, user.id, limit=5)
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

        transcript = "\n".join(
            f"{'Usuário' if m.role is MessageRole.USER else 'Assistente'}: {m.content}"
            for m in conversation.messages
            if m.role is not MessageRole.SYSTEM
        )
        draft = self._ticket_draft(user, conversation.id, transcript)
        if draft is not None:
            # A equipe recebe o resumo da IA e, abaixo, a conversa completa.
            title = draft.title
            description = f"{draft.description}\n\nConversa com o Assistente de TI:\n{transcript}"
            categories = CategoryRepository(self.session).list_active(user.company_id)
            category = next((c for c in categories if c.name == draft.category_name), None)
            category_id = category.id if category else None
            priority = draft.priority
        else:
            first = user_messages[0]
            title = first if len(first) <= 120 else first[:117].rstrip() + "..."
            title = title if len(title) >= 5 else f"Solicitação: {title}"
            description = (
                "Chamado aberto pelo Assistente de TI após a conversa abaixo.\n\n" + transcript
            )
            classification = self.ai.classify(
                user,
                "\n".join(user_messages),
                input_reference=f"conversation:{conversation.id}",
                use_llm=False,
            )
            category_id = classification.category.id if classification.category else None
            priority = classification.classification.priority
        description = description[:20_000]
        ticket = TicketService(self.session).create(
            user,
            TicketCreate(
                title=title,
                description=description if len(description) >= 10 else f"{description} (chat)",
                category_id=category_id,
                priority=priority,
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

    def _ticket_draft(
        self, user: User, conversation_id: int, transcript: str
    ) -> TicketDraft | None:
        """Resumo da conversa pela IA; `None` sem provedor ou se a IA falhar."""
        if self.provider is None:
            return None
        names = [c.name for c in CategoryRepository(self.session).list_active(user.company_id)]
        started = time.perf_counter()
        try:
            draft = summarize_for_ticket(self.provider, transcript, names)
        except (AIProviderError, InvalidAnswerError) as exc:
            logger.warning("Resumo do chamado por LLM falhou", extra={"error": str(exc)})
            self._log_summary(
                user,
                conversation_id,
                None,
                error=str(exc),
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return None
        self._log_summary(user, conversation_id, draft)
        return draft

    def _log_summary(
        self,
        user: User,
        conversation_id: int,
        draft: TicketDraft | None,
        *,
        error: str | None = None,
        latency_ms: int | None = None,
    ) -> None:
        llm = draft.llm if draft else None
        self.session.add(
            AIAction(
                company_id=user.company_id,
                user_id=user.id,
                action_type=AIActionType.SUMMARIZE_TICKET,
                input_reference=f"conversation:{conversation_id}:ticket",
                output=json.dumps(
                    {"category": draft.category_name, "priority": draft.priority.value}
                )
                if draft
                else None,
                model=llm.model if llm else (self.provider.model if self.provider else "heuristic"),
                success=draft is not None,
                error_message=error[:500] if error else None,
                latency_ms=llm.latency_ms if llm else latency_ms,
                input_tokens=llm.input_tokens if llm else None,
                output_tokens=llm.output_tokens if llm else None,
            )
        )
        self.session.flush()

    def resolve(self, user: User, conversation_id: int) -> Conversation:
        conversation = self.get(user, conversation_id)
        if conversation.status is ConversationStatus.ACTIVE:
            conversation.status = ConversationStatus.RESOLVED
            self.session.commit()
        return self.get(user, conversation_id)

    def feedback(
        self, user: User, message_id: int, rating: AIFeedbackRating, text: str | None
    ) -> AIFeedback:
        message = self.conversations.assistant_message_for_user(
            user.company_id, user.id, message_id
        )
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
                        "status": reply.status,
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


def _search_query(text: str, history: list[PastMessage]) -> str:
    """Busca no RAG pelo problema original + a mensagem atual.

    Em respostas como "não funcionou", a mensagem sozinha não diz qual é o problema.
    """
    first = first_problem(history)
    return f"{first}\n{text}"[:1000] if first else text
