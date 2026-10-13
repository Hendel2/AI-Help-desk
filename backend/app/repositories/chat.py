"""Conversas do Assistente de TI. Só o dono vê a conversa: empresa + usuário em toda consulta."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Conversation, Message
from app.models.enums import MessageRole
from app.repositories.base import _require_company_id


class ConversationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_for_user(self, company_id: int, user_id: int, *, limit: int) -> Sequence[Conversation]:
        stmt = (
            select(Conversation)
            .where(
                Conversation.company_id == _require_company_id(company_id),
                Conversation.user_id == user_id,
            )
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
            .limit(limit)
        )
        return self.session.scalars(stmt).all()

    def get_for_user(
        self, company_id: int, user_id: int, conversation_id: int
    ) -> Conversation | None:
        stmt = (
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.company_id == _require_company_id(company_id),
                Conversation.user_id == user_id,
            )
            .options(selectinload(Conversation.messages))
            # Recarrega as mensagens já presentes na sessão (respostas recém-criadas).
            .execution_options(populate_existing=True)
        )
        return self.session.scalars(stmt).one_or_none()

    def assistant_message_for_user(
        self, company_id: int, user_id: int, message_id: int
    ) -> Message | None:
        """Resposta do assistente numa conversa do próprio usuário (para avaliação)."""
        stmt = (
            select(Message)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                Message.id == message_id,
                Message.role == MessageRole.ASSISTANT,
                Conversation.company_id == _require_company_id(company_id),
                Conversation.user_id == user_id,
            )
        )
        return self.session.scalars(stmt).one_or_none()
