"""Notificações. A caixa de entrada é sempre do próprio usuário (empresa + destinatário)."""

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.models import Notification, Ticket
from app.models.enums import NotificationType
from app.repositories.base import _require_company_id
from app.repositories.ticket import ACTIVE_STATUSES


class NotificationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    @staticmethod
    def _inbox(company_id: int, user_id: int) -> list[Any]:
        return [
            Notification.company_id == _require_company_id(company_id),
            Notification.user_id == user_id,
        ]

    def list_for_user(
        self, company_id: int, user_id: int, *, unread_only: bool, offset: int, limit: int
    ) -> tuple[Sequence[Notification], int]:
        conditions = self._inbox(company_id, user_id)
        if unread_only:
            conditions.append(Notification.is_read.is_(False))
        items = self.session.scalars(
            select(Notification)
            .where(*conditions)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
        total = self.session.scalar(
            select(func.count()).select_from(Notification).where(*conditions)
        )
        return items, total or 0

    def unread_count(self, company_id: int, user_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(Notification)
            .where(*self._inbox(company_id, user_id), Notification.is_read.is_(False))
        )
        return self.session.scalar(stmt) or 0

    def get_for_user(
        self, company_id: int, user_id: int, notification_id: int
    ) -> Notification | None:
        stmt = select(Notification).where(
            Notification.id == notification_id, *self._inbox(company_id, user_id)
        )
        return self.session.scalars(stmt).one_or_none()

    def mark_all_read(self, company_id: int, user_id: int, *, now: datetime) -> int:
        result = self.session.execute(
            update(Notification)
            .where(*self._inbox(company_id, user_id), Notification.is_read.is_(False))
            .values(is_read=True, read_at=now)
        )
        return result.rowcount or 0  # type: ignore[attr-defined]

    def exists_for_ticket(self, ticket_id: int, type_: NotificationType) -> bool:
        stmt = select(Notification.id).where(
            Notification.ticket_id == ticket_id, Notification.type == type_
        )
        return self.session.scalars(stmt.limit(1)).first() is not None

    def tickets_with_open_deadlines(self) -> Sequence[Ticket]:
        """Varredura de SISTEMA do monitor de SLA: percorre todas as empresas.

        Cada alerta gerado a partir daqui é enviado apenas a pessoas da empresa
        do próprio chamado (ver `NotificationService.scan_sla_alerts`).
        """
        stmt = (
            select(Ticket)
            .where(
                Ticket.status.in_(ACTIVE_STATUSES),
                Ticket.response_deadline.is_not(None) | Ticket.resolution_deadline.is_not(None),
            )
            .options(joinedload(Ticket.technician))
        )
        return self.session.scalars(stmt).unique().all()
