from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin
from app.models.enums import TicketHistoryAction
from app.models.types import enum_column

if TYPE_CHECKING:
    from app.models.ticket import Ticket
    from app.models.user import User


class TicketHistory(CreatedAtMixin, Base):
    """Linha do tempo do chamado (ex.: status IN_PROGRESS -> RESOLVED)."""

    __tablename__ = "ticket_history"
    __table_args__ = (Index(None, "ticket_id", "created_at"),)

    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"))
    # NULL = ação do sistema ou da IA.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    action: Mapped[TicketHistoryAction] = mapped_column(enum_column(TicketHistoryAction))
    field: Mapped[str | None] = mapped_column(String(50))
    old_value: Mapped[str | None] = mapped_column(String(255))
    new_value: Mapped[str | None] = mapped_column(String(255))

    ticket: Mapped["Ticket"] = relationship(back_populates="history")
    # NULL quando a ação foi do sistema ou da IA.
    user: Mapped["User | None"] = relationship()
