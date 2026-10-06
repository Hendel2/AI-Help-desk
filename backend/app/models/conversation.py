from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, TimestampMixin
from app.models.enums import ConversationStatus
from app.models.types import enum_column

if TYPE_CHECKING:
    from app.models.message import Message


class Conversation(CompanyScopedMixin, TimestampMixin, Base):
    """Conversa com o Assistente de TI (chatbot)."""

    __tablename__ = "conversations"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[ConversationStatus] = mapped_column(
        enum_column(ConversationStatus),
        default=ConversationStatus.ACTIVE,
        server_default=ConversationStatus.ACTIVE.value,
    )
    # Chamado criado quando a conversa é escalada para o suporte humano.
    ticket_id: Mapped[int | None] = mapped_column(
        ForeignKey("tickets.id", ondelete="SET NULL"), index=True
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(Message.created_at, Message.id)",
    )
