"""Schemas de notificações (§22)."""

from datetime import datetime

from pydantic import BaseModel

from app.models.enums import NotificationType
from app.schemas.common import ORMModel


class NotificationRead(ORMModel):
    id: int
    type: NotificationType
    title: str
    message: str
    ticket_id: int | None
    is_read: bool
    read_at: datetime | None
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int


class MarkedCount(BaseModel):
    updated: int
