"""Rotas de chamados (§32). A rota só traduz HTTP ↔ schema; as regras ficam no serviço."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import ClientIpDep, CurrentUser, SessionDep
from app.models import Ticket, User
from app.models.enums import TicketPriority, TicketStatus
from app.repositories.ticket import TicketFilters
from app.schemas.common import ErrorResponse, Page, PageParams
from app.schemas.ticket import (
    SLAClockRead,
    SLARead,
    TicketAssign,
    TicketClose,
    TicketCommentCreate,
    TicketCommentRead,
    TicketCreate,
    TicketHistoryRead,
    TicketListItem,
    TicketRead,
    TicketResolve,
    TicketStatusChange,
    TicketUpdate,
)
from app.services import sla
from app.services.tickets import TicketService

router = APIRouter(prefix="/tickets", tags=["tickets"])

NOT_FOUND = {404: {"model": ErrorResponse, "description": "Chamado não encontrado"}}


def get_ticket_service(session: SessionDep) -> TicketService:
    return TicketService(session)


ServiceDep = Annotated[TicketService, Depends(get_ticket_service)]


def _sla_read(info: sla.SLAInfo) -> SLARead:
    return SLARead(
        status=info.status,
        response=SLAClockRead(**vars(info.response)),
        resolution=SLAClockRead(**vars(info.resolution)),
    )


def _to_list_item(ticket: Ticket, service: TicketService) -> TicketListItem:
    return TicketListItem.model_validate(
        {**ticket.__dict__, "sla": _sla_read(service.evaluate_sla(ticket))},
        from_attributes=True,
    )


def _to_read(ticket: Ticket, service: TicketService, user: User) -> TicketRead:
    return TicketRead.model_validate(
        {
            **ticket.__dict__,
            "sla": _sla_read(service.evaluate_sla(ticket)),
            "allowed_transitions": service.allowed_transitions(user, ticket),
        },
        from_attributes=True,
    )


@router.get("", response_model=Page[TicketListItem], summary="Lista chamados com filtros")
def list_tickets(
    user: CurrentUser,
    service: ServiceDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ticket_status: Annotated[list[TicketStatus] | None, Query(alias="status")] = None,
    priority: Annotated[list[TicketPriority] | None, Query()] = None,
    category_id: Annotated[int | None, Query(ge=1)] = None,
    technician_id: Annotated[int | None, Query(ge=1)] = None,
    unassigned: Annotated[bool, Query()] = False,
    mine: Annotated[bool, Query(description="Somente os chamados que eu abri")] = False,
    search: Annotated[str | None, Query(max_length=200)] = None,
    created_from: Annotated[datetime | None, Query()] = None,
    created_to: Annotated[datetime | None, Query()] = None,
) -> Page[TicketListItem]:
    params = PageParams(page=page, page_size=page_size)
    filters = TicketFilters(
        status=ticket_status,
        priority=priority,
        category_id=category_id,
        technician_id=technician_id,
        unassigned=unassigned,
        requester_id=user.id if mine else None,
        search=search,
        created_from=created_from,
        created_to=created_to,
    )
    items, total = service.list(user, filters, offset=params.offset, limit=params.limit)
    return Page[TicketListItem].build(
        [_to_list_item(ticket, service) for ticket in items], total, params
    )


@router.post(
    "",
    response_model=TicketRead,
    status_code=status.HTTP_201_CREATED,
    summary="Abre um chamado",
)
def create_ticket(
    data: TicketCreate, user: CurrentUser, service: ServiceDep, ip: ClientIpDep
) -> TicketRead:
    return _to_read(service.create(user, data, ip_address=ip), service, user)


@router.get(
    "/{ticket_id}", response_model=TicketRead, responses=NOT_FOUND, summary="Detalhe do chamado"
)
def get_ticket(ticket_id: int, user: CurrentUser, service: ServiceDep) -> TicketRead:
    return _to_read(service.get(user, ticket_id), service, user)


@router.put(
    "/{ticket_id}", response_model=TicketRead, responses=NOT_FOUND, summary="Atualiza o chamado"
)
def update_ticket(
    ticket_id: int,
    data: TicketUpdate,
    user: CurrentUser,
    service: ServiceDep,
    ip: ClientIpDep,
) -> TicketRead:
    return _to_read(service.update(user, ticket_id, data, ip_address=ip), service, user)


@router.post(
    "/{ticket_id}/assign",
    response_model=TicketRead,
    responses=NOT_FOUND,
    summary="Atribui o chamado a um técnico",
)
def assign_ticket(
    ticket_id: int,
    data: TicketAssign,
    user: CurrentUser,
    service: ServiceDep,
    ip: ClientIpDep,
) -> TicketRead:
    return _to_read(
        service.assign(user, ticket_id, data.technician_id, ip_address=ip), service, user
    )


@router.post(
    "/{ticket_id}/status",
    response_model=TicketRead,
    responses=NOT_FOUND,
    summary="Altera o status respeitando as transições válidas",
)
def change_status(
    ticket_id: int,
    data: TicketStatusChange,
    user: CurrentUser,
    service: ServiceDep,
    ip: ClientIpDep,
) -> TicketRead:
    ticket = service.change_status(
        user, ticket_id, data.status, comment=data.comment, ip_address=ip
    )
    return _to_read(ticket, service, user)


@router.post(
    "/{ticket_id}/resolve",
    response_model=TicketRead,
    responses=NOT_FOUND,
    summary="Resolve o chamado registrando a solução",
)
def resolve_ticket(
    ticket_id: int,
    data: TicketResolve,
    user: CurrentUser,
    service: ServiceDep,
    ip: ClientIpDep,
) -> TicketRead:
    return _to_read(service.resolve(user, ticket_id, data.solution, ip_address=ip), service, user)


@router.post(
    "/{ticket_id}/close",
    response_model=TicketRead,
    responses=NOT_FOUND,
    summary="Encerra o chamado",
)
def close_ticket(
    ticket_id: int,
    data: TicketClose,
    user: CurrentUser,
    service: ServiceDep,
    ip: ClientIpDep,
) -> TicketRead:
    return _to_read(
        service.close(user, ticket_id, reason=data.reason, ip_address=ip), service, user
    )


@router.get(
    "/{ticket_id}/comments",
    response_model=list[TicketCommentRead],
    responses=NOT_FOUND,
    summary="Comentários do chamado (internos só para a equipe)",
)
def list_comments(
    ticket_id: int, user: CurrentUser, service: ServiceDep
) -> list[TicketCommentRead]:
    comments = service.list_comments(user, ticket_id)
    return [TicketCommentRead.model_validate(comment) for comment in comments]


@router.post(
    "/{ticket_id}/comments",
    response_model=TicketCommentRead,
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
    summary="Comenta no chamado",
)
def add_comment(
    ticket_id: int,
    data: TicketCommentCreate,
    user: CurrentUser,
    service: ServiceDep,
    ip: ClientIpDep,
) -> TicketCommentRead:
    comment = service.add_comment(
        user, ticket_id, data.content, is_internal=data.is_internal, ip_address=ip
    )
    return TicketCommentRead.model_validate(comment)


@router.get(
    "/{ticket_id}/history",
    response_model=list[TicketHistoryRead],
    responses=NOT_FOUND,
    summary="Linha do tempo do chamado",
)
def list_history(ticket_id: int, user: CurrentUser, service: ServiceDep) -> list[TicketHistoryRead]:
    entries = service.list_history(user, ticket_id)
    return [TicketHistoryRead.model_validate(entry) for entry in entries]
