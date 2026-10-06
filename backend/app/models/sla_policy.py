import sqlalchemy as sa
from sqlalchemy import CheckConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CompanyScopedMixin, TimestampMixin
from app.models.enums import TicketPriority
from app.models.types import enum_column


class SLAPolicy(CompanyScopedMixin, TimestampMixin, Base):
    """Política de SLA (prazos em minutos).

    Normalmente vinculada a uma categoria (`categories.default_sla_policy_id`).
    Quando `priority` está preenchida, a política é o fallback da empresa para
    chamados dessa prioridade cuja categoria não tem política própria.
    A regra de resolução é implementada na etapa 09 (SLA).
    """

    __tablename__ = "sla_policies"
    __table_args__ = (
        UniqueConstraint("company_id", "name"),
        CheckConstraint("response_time_minutes > 0", name="response_time_positive"),
        CheckConstraint(
            "resolution_time_minutes >= response_time_minutes",
            name="resolution_gte_response",
        ),
    )

    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255))
    priority: Mapped[TicketPriority | None] = mapped_column(enum_column(TicketPriority))
    response_time_minutes: Mapped[int]
    resolution_time_minutes: Mapped[int]
    is_active: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
