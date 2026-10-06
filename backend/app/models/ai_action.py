from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CompanyScopedMixin, CreatedAtMixin
from app.models.enums import AIActionType
from app.models.types import LongText, enum_column


class AIAction(CompanyScopedMixin, CreatedAtMixin, Base):
    """Registro de cada ação executada pela IA (seções 69 e 71)."""

    __tablename__ = "ai_actions"
    __table_args__ = (Index(None, "company_id", "action_type", "created_at"),)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action_type: Mapped[AIActionType] = mapped_column(enum_column(AIActionType))
    # Referência à entrada (ex.: "ticket:123", "conversation:45"), nunca o conteúdo
    # bruto, que pode conter dados sensíveis.
    input_reference: Mapped[str | None] = mapped_column(String(100))
    output: Mapped[str | None] = mapped_column(LongText)
    model: Mapped[str] = mapped_column(String(100))
    # Sem valor padrão de propósito: o resultado deve ser sempre informado.
    success: Mapped[bool]
    error_message: Mapped[str | None] = mapped_column(String(500))
    # Observabilidade da IA (seção 71).
    latency_ms: Mapped[int | None]
    input_tokens: Mapped[int | None]
    output_tokens: Mapped[int | None]
