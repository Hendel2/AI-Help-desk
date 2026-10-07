"""Schemas de chamados, comentários e histórico."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.models.enums import (
    SLAStatus,
    TicketHistoryAction,
    TicketPriority,
    TicketSource,
    TicketStatus,
)
from app.schemas.common import ORMModel

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=10, max_length=20_000)
]
CommentContent = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10_000)
]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class UserSummary(ORMModel):
    """Identificação mínima de uma pessoa dentro de um chamado."""

    id: int
    name: str
    email: str


class CategorySummary(ORMModel):
    id: int
    name: str


class SLAClockRead(BaseModel):
    deadline: datetime | None
    completed_at: datetime | None
    status: SLAStatus | None
    remaining_seconds: int | None


class SLARead(BaseModel):
    """Estado do SLA do chamado (§21). `status` nulo = sem política aplicável."""

    status: SLAStatus | None
    response: SLAClockRead
    resolution: SLAClockRead


class TicketCreate(BaseModel):
    title: Title
    description: Description
    category_id: int | None = None
    # Sugestão do solicitante; a categoria pode definir outra prioridade padrão.
    priority: TicketPriority | None = None


class TicketUpdate(BaseModel):
    """Campos editáveis. `None` = não alterar."""

    title: Title | None = None
    description: Description | None = None
    category_id: int | None = None
    priority: TicketPriority | None = None


class TicketAssign(BaseModel):
    """Sem `technician_id` o técnico autenticado assume o chamado (§7)."""

    technician_id: int | None = None


class TicketStatusChange(BaseModel):
    status: TicketStatus
    comment: CommentContent | None = None


class TicketResolve(BaseModel):
    """A solução é registrada como comentário público do chamado."""

    solution: CommentContent


class TicketClose(BaseModel):
    reason: Reason | None = None


class TicketListItem(ORMModel):
    id: int
    ticket_number: str
    title: str
    status: TicketStatus
    priority: TicketPriority
    source: TicketSource
    created_at: datetime
    updated_at: datetime
    requester: UserSummary
    technician: UserSummary | None
    category: CategorySummary | None
    sla: SLARead


class TicketRead(TicketListItem):
    description: str
    first_response_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None
    # Ações de status que o usuário autenticado pode executar agora (calculado no backend).
    allowed_transitions: list[TicketStatus] = []


class TicketCommentCreate(BaseModel):
    content: CommentContent
    # Somente TECHNICIAN e ADMIN podem marcar como interno (§18).
    is_internal: bool = False


class TicketCommentRead(ORMModel):
    id: int
    content: str
    is_internal: bool
    created_at: datetime
    author: UserSummary


class TicketHistoryRead(ORMModel):
    id: int
    action: TicketHistoryAction
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime
    user: UserSummary | None


class TicketAttachmentRead(ORMModel):
    id: int
    file_name: str
    file_type: str
    file_size: int
    created_at: datetime
    uploader: UserSummary
