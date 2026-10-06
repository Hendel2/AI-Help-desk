from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, CheckConstraint, Float, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin
from app.models.enums import ChatIntent, MessageRole
from app.models.types import enum_column

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class Message(CreatedAtMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index(None, "conversation_id", "created_at"),
        # A saída da IA nunca é confiável: o banco também barra valores fora de [0, 1].
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="confidence_range",
        ),
    )

    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[MessageRole] = mapped_column(enum_column(MessageRole))
    content: Mapped[str] = mapped_column(Text)
    # Intenção classificada (mensagens do usuário) e confiança do classificador.
    intent: Mapped[ChatIntent | None] = mapped_column(enum_column(ChatIntent))
    confidence: Mapped[float | None] = mapped_column(Float)
    # Fontes da base de conhecimento usadas na resposta (ex.: ids/títulos de artigos).
    sources: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
