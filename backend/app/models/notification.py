from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CompanyScopedMixin, CreatedAtMixin
from app.models.enums import NotificationType
from app.models.types import UTCDateTime, enum_column


class Notification(CompanyScopedMixin, CreatedAtMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (Index(None, "user_id", "is_read"),)

    # Destinatário.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(enum_column(NotificationType))
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(String(500))
    ticket_id: Mapped[int | None] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    is_read: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
