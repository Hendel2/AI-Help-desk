from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, TimestampMixin
from app.models.enums import TicketPriority, TicketSource, TicketStatus
from app.models.types import UTCDateTime, enum_column

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.sla_policy import SLAPolicy
    from app.models.ticket_attachment import TicketAttachment
    from app.models.ticket_comment import TicketComment
    from app.models.ticket_history import TicketHistory
    from app.models.ticket_rating import TicketRating
    from app.models.user import User


class Ticket(CompanyScopedMixin, TimestampMixin, Base):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("company_id", "ticket_number"),
        Index(None, "company_id", "status"),
        Index(None, "company_id", "technician_id"),
        Index(None, "company_id", "user_id"),
        Index(None, "company_id", "created_at"),
    )

    # Identificador amigável exibido na interface (HD-000001), sequencial por
    # empresa. A geração é implementada na etapa 08 (Tickets).
    ticket_number: Mapped[str] = mapped_column(String(20))

    # Solicitante. RESTRICT: usuários com chamados são desativados, nunca apagados.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    technician_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    sla_policy_id: Mapped[int | None] = mapped_column(
        ForeignKey("sla_policies.id", ondelete="SET NULL"), index=True
    )

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)

    priority: Mapped[TicketPriority] = mapped_column(
        enum_column(TicketPriority),
        default=TicketPriority.MEDIUM,
        server_default=TicketPriority.MEDIUM.value,
    )
    status: Mapped[TicketStatus] = mapped_column(
        enum_column(TicketStatus),
        default=TicketStatus.OPEN,
        server_default=TicketStatus.OPEN.value,
    )
    source: Mapped[TicketSource] = mapped_column(
        enum_column(TicketSource),
        default=TicketSource.WEB,
        server_default=TicketSource.WEB.value,
    )

    response_deadline: Mapped[datetime | None] = mapped_column(UTCDateTime())
    resolution_deadline: Mapped[datetime | None] = mapped_column(UTCDateTime())
    first_response_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    requester: Mapped["User"] = relationship(foreign_keys=[user_id])
    technician: Mapped["User | None"] = relationship(foreign_keys=[technician_id])
    category: Mapped["Category | None"] = relationship()
    sla_policy: Mapped["SLAPolicy | None"] = relationship()

    comments: Mapped[list["TicketComment"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TicketComment.created_at",
    )
    attachments: Mapped[list["TicketAttachment"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TicketAttachment.created_at",
    )
    history: Mapped[list["TicketHistory"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TicketHistory.created_at",
    )
    rating: Mapped["TicketRating | None"] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
