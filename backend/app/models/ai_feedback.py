from sqlalchemy import CheckConstraint, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CompanyScopedMixin, CreatedAtMixin
from app.models.enums import AIFeedbackRating
from app.models.types import enum_column


class AIFeedback(CompanyScopedMixin, CreatedAtMixin, Base):
    """Avaliação (positiva/negativa) de uma resposta do chatbot ou de uma ação da IA."""

    __tablename__ = "ai_feedback"
    __table_args__ = (
        CheckConstraint(
            "message_id IS NOT NULL OR ai_action_id IS NOT NULL",
            name="target_required",
        ),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    message_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), index=True
    )
    ai_action_id: Mapped[int | None] = mapped_column(
        ForeignKey("ai_actions.id", ondelete="CASCADE"), index=True
    )
    rating: Mapped[AIFeedbackRating] = mapped_column(enum_column(AIFeedbackRating))
    feedback_text: Mapped[str | None] = mapped_column(Text)
