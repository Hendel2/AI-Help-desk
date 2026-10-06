import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CompanyScopedMixin, TimestampMixin
from app.models.enums import TicketPriority
from app.models.types import enum_column


class Category(CompanyScopedMixin, TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("company_id", "name"),)

    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255))
    default_priority: Mapped[TicketPriority] = mapped_column(
        enum_column(TicketPriority),
        default=TicketPriority.MEDIUM,
        server_default=TicketPriority.MEDIUM.value,
    )
    default_sla_policy_id: Mapped[int | None] = mapped_column(
        ForeignKey("sla_policies.id", ondelete="SET NULL"), index=True
    )
    # Adição: categorias em uso por chamados antigos são desativadas, não apagadas.
    is_active: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
