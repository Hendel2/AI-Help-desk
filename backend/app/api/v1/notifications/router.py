"""Caixa de notificações do usuário autenticado (§22)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep
from app.schemas.common import ErrorResponse, Page, PageParams
from app.schemas.notification import MarkedCount, NotificationRead, UnreadCount
from app.services.notifications import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


def get_notification_service(session: SessionDep) -> NotificationService:
    return NotificationService(session)


ServiceDep = Annotated[NotificationService, Depends(get_notification_service)]


@router.get("", response_model=Page[NotificationRead], summary="Minhas notificações")
def list_notifications(
    user: CurrentUser,
    service: ServiceDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
    unread: Annotated[bool, Query(description="Somente não lidas")] = False,
) -> Page[NotificationRead]:
    params = PageParams(page=page, page_size=page_size)
    items, total = service.list_for(
        user, unread_only=unread, offset=params.offset, limit=params.limit
    )
    return Page[NotificationRead].build(
        [NotificationRead.model_validate(item) for item in items], total, params
    )


@router.get("/unread-count", response_model=UnreadCount, summary="Quantidade de não lidas")
def unread_count(user: CurrentUser, service: ServiceDep) -> UnreadCount:
    return UnreadCount(unread=service.unread_count(user))


@router.post(
    "/{notification_id}/read",
    response_model=NotificationRead,
    summary="Marca como lida",
    responses={404: {"model": ErrorResponse, "description": "Notificação não encontrada"}},
)
def mark_read(notification_id: int, user: CurrentUser, service: ServiceDep) -> NotificationRead:
    return NotificationRead.model_validate(service.mark_read(user, notification_id))


@router.post("/read-all", response_model=MarkedCount, summary="Marca todas como lidas")
def mark_all_read(user: CurrentUser, service: ServiceDep) -> MarkedCount:
    return MarkedCount(updated=service.mark_all_read(user))
