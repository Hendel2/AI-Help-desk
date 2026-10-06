"""Schemas de categoria."""

from app.models.enums import TicketPriority
from app.schemas.common import ORMModel


class CategoryRead(ORMModel):
    id: int
    name: str
    description: str | None
    default_priority: TicketPriority
