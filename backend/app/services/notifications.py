"""Notificações (§22).

Eventos de chamado notificam dentro da mesma transação da ação (quem chama
faz o commit). Alertas de SLA são gerados pelo monitor periódico em
`scan_sla_alerts`, sem duplicar o mesmo alerta para o mesmo chamado.
"""

import logging
from collections.abc import Iterable, Sequence
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError
from app.models import Notification, Role, Ticket, User
from app.models.enums import NotificationType, RoleName, SLAStatus
from app.models.types import utcnow
from app.repositories.base import _require_company_id
from app.repositories.dashboard import ACTIVE_STATUSES
from app.services import sla

logger = logging.getLogger("app.notifications")

STAFF = (RoleName.TECHNICIAN, RoleName.ADMIN)


class NotificationService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- Envio --------------------------------------------------------------

    def _staff(self, company_id: int, roles: Iterable[RoleName] = STAFF) -> Sequence[User]:
        stmt = (
            select(User)
            .join(Role, Role.id == User.role_id)
            .where(
                User.company_id == _require_company_id(company_id),
                User.is_active.is_(True),
                Role.name.in_(tuple(roles)),
            )
        )
        return self.session.scalars(stmt).all()

    def _send(
        self,
        recipients: Iterable[User | None],
        *,
        ticket: Ticket,
        type_: NotificationType,
        title: str,
        message: str,
        actor: User | None = None,
    ) -> int:
        """Cria uma notificação por destinatário (sem repetir e nunca para quem agiu)."""
        sent: set[int] = set()
        for user in recipients:
            if user is None or user.id in sent or (actor is not None and user.id == actor.id):
                continue
            if user.company_id != ticket.company_id or not user.is_active:
                continue  # defesa em profundidade: nunca notificar outra empresa
            self.session.add(
                Notification(
                    company_id=ticket.company_id,
                    user_id=user.id,
                    type=type_,
                    title=title[:200],
                    message=message[:500],
                    ticket_id=ticket.id,
                )
            )
            sent.add(user.id)
        if sent:
            self.session.flush()
        return len(sent)

    def ticket_created(self, ticket: Ticket, actor: User) -> None:
        self._send(
            self._staff(ticket.company_id),
            ticket=ticket,
            type_=NotificationType.TICKET_CREATED,
            title=f"Novo chamado {ticket.ticket_number}",
            message=f"{actor.name} abriu: {ticket.title}",
            actor=actor,
        )

    def ticket_assigned(self, ticket: Ticket, actor: User) -> None:
        technician = ticket.technician
        if technician is None:
            return
        self._send(
            [technician],
            ticket=ticket,
            type_=NotificationType.TICKET_ASSIGNED,
            title=f"Chamado {ticket.ticket_number} atribuído a você",
            message=ticket.title,
            actor=actor,
        )
        self._send(
            [ticket.requester],
            ticket=ticket,
            type_=NotificationType.TICKET_ASSIGNED,
            title=f"Seu chamado {ticket.ticket_number} está com {technician.name}",
            message=ticket.title,
            actor=actor,
        )

    def comment_added(self, ticket: Ticket, actor: User, *, is_internal: bool) -> None:
        if is_internal:
            # Interno: só a equipe responsável fica sabendo.
            recipients: list[User | None] = [ticket.technician]
        elif actor.id == ticket.user_id:
            recipients = [ticket.technician]
        else:
            recipients = [ticket.requester, ticket.technician]
        self._send(
            recipients,
            ticket=ticket,
            type_=NotificationType.COMMENT_ADDED,
            title=f"Nova mensagem em {ticket.ticket_number}",
            message=f"{actor.name} respondeu: {ticket.title}",
            actor=actor,
        )

    def ticket_resolved(self, ticket: Ticket, actor: User) -> None:
        self._send(
            [ticket.requester],
            ticket=ticket,
            type_=NotificationType.TICKET_RESOLVED,
            title=f"Chamado {ticket.ticket_number} resolvido",
            message=f"{actor.name} registrou uma solução. Confirme se o problema foi resolvido.",
            actor=actor,
        )

    # --- Monitor de SLA -----------------------------------------------------

    def scan_sla_alerts(self, *, now: datetime | None = None) -> int:
        """Gera alertas de SLA ainda não enviados. Retorna quantos foram criados.

        Roda para todas as empresas (tarefa de sistema), mas cada alerta é
        enviado apenas a pessoas da empresa do próprio chamado.
        """
        now = now or utcnow()
        tickets = (
            self.session.scalars(
                select(Ticket)
                .where(
                    Ticket.status.in_(ACTIVE_STATUSES),
                    Ticket.response_deadline.is_not(None) | Ticket.resolution_deadline.is_not(None),
                )
                .options(joinedload(Ticket.technician))
            )
            .unique()
            .all()
        )

        created = 0
        for ticket in tickets:
            state = sla.evaluate(ticket, now=now).status
            if state not in (SLAStatus.WARNING, SLAStatus.BREACHED):
                continue
            type_ = (
                NotificationType.SLA_BREACHED
                if state is SLAStatus.BREACHED
                else NotificationType.SLA_WARNING
            )
            if self._already_alerted(ticket.id, type_):
                continue
            if ticket.technician is not None:
                recipients: list[User | None] = [ticket.technician]
            else:
                recipients = list(self._staff(ticket.company_id))
            if type_ is NotificationType.SLA_BREACHED:
                recipients += list(self._staff(ticket.company_id, (RoleName.ADMIN,)))
            created += self._send(
                recipients,
                ticket=ticket,
                type_=type_,
                title=(
                    f"SLA vencido: {ticket.ticket_number}"
                    if type_ is NotificationType.SLA_BREACHED
                    else f"SLA próximo do vencimento: {ticket.ticket_number}"
                ),
                message=ticket.title,
            )
        self.session.commit()
        if created:
            logger.info("Alertas de SLA gerados", extra={"created": created})
        return created

    def _already_alerted(self, ticket_id: int, type_: NotificationType) -> bool:
        stmt = select(Notification.id).where(
            Notification.ticket_id == ticket_id, Notification.type == type_
        )
        return self.session.scalars(stmt.limit(1)).first() is not None

    # --- Caixa de entrada do usuário ---------------------------------------

    def list_for(
        self, user: User, *, unread_only: bool, offset: int, limit: int
    ) -> tuple[Sequence[Notification], int]:
        conditions = [
            Notification.company_id == _require_company_id(user.company_id),
            Notification.user_id == user.id,
        ]
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

    def unread_count(self, user: User) -> int:
        return (
            self.session.scalar(
                select(func.count())
                .select_from(Notification)
                .where(
                    Notification.company_id == user.company_id,
                    Notification.user_id == user.id,
                    Notification.is_read.is_(False),
                )
            )
            or 0
        )

    def mark_read(self, user: User, notification_id: int) -> Notification:
        notification = self.session.scalars(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.company_id == user.company_id,
                Notification.user_id == user.id,  # só o destinatário
            )
        ).one_or_none()
        if notification is None:
            raise NotFoundError("Notificação não encontrada.", code="NOTIFICATION_NOT_FOUND")
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = utcnow()
            self.session.commit()
        return notification

    def mark_all_read(self, user: User) -> int:
        result = self.session.execute(
            update(Notification)
            .where(
                Notification.company_id == user.company_id,
                Notification.user_id == user.id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=utcnow())
        )
        self.session.commit()
        return result.rowcount or 0  # type: ignore[attr-defined]
