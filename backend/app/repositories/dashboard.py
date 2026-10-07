"""Consultas agregadas do dashboard. Toda consulta exige `company_id`.

Agregações portáveis entre MySQL 8.4, MariaDB 10.4 e SQLite: contagens e
`DATE()` ficam no banco; diferenças entre datas (tempo de resolução) são
calculadas em Python sobre o período consultado, que é limitado.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Category, Ticket, TicketHistory, TicketRating, User
from app.models.enums import TicketPriority, TicketStatus
from app.repositories.base import _require_company_id

ACTIVE_STATUSES = (
    TicketStatus.OPEN,
    TicketStatus.TRIAGE,
    TicketStatus.ASSIGNED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_USER,
)


@dataclass(frozen=True)
class Scope:
    """Recorte dos dados: a empresa e, opcionalmente, um solicitante ou técnico."""

    company_id: int
    requester_id: int | None = None
    technician_id: int | None = None


class DashboardRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _filter(self, stmt: Select, scope: Scope) -> Select:  # type: ignore[type-arg]
        stmt = stmt.where(Ticket.company_id == _require_company_id(scope.company_id))
        if scope.requester_id is not None:
            stmt = stmt.where(Ticket.user_id == scope.requester_id)
        if scope.technician_id is not None:
            stmt = stmt.where(Ticket.technician_id == scope.technician_id)
        return stmt

    def count_by_status(self, scope: Scope) -> dict[TicketStatus, int]:
        stmt = self._filter(
            select(Ticket.status, func.count()).select_from(Ticket).group_by(Ticket.status), scope
        )
        return {status: count for status, count in self.session.execute(stmt)}

    def count_created_since(self, scope: Scope, since: datetime) -> int:
        stmt = self._filter(
            select(func.count()).select_from(Ticket).where(Ticket.created_at >= since), scope
        )
        return self.session.scalar(stmt) or 0

    def active_tickets(self, scope: Scope) -> Sequence[Ticket]:
        """Chamados em aberto (para avaliar o SLA atual de cada um)."""
        stmt = self._filter(select(Ticket).where(Ticket.status.in_(ACTIVE_STATUSES)), scope)
        return self.session.scalars(stmt).all()

    def count_active_by_priority(self, scope: Scope) -> dict[TicketPriority, int]:
        stmt = self._filter(
            select(Ticket.priority, func.count())
            .select_from(Ticket)
            .where(Ticket.status.in_(ACTIVE_STATUSES))
            .group_by(Ticket.priority),
            scope,
        )
        return {priority: count for priority, count in self.session.execute(stmt)}

    def count_by_category_since(self, scope: Scope, since: datetime) -> list[tuple[str, int]]:
        stmt = self._filter(
            select(func.coalesce(Category.name, "Sem categoria"), func.count(Ticket.id))
            .select_from(Ticket)
            .outerjoin(Category, Category.id == Ticket.category_id)
            .where(Ticket.created_at >= since)
            .group_by(Category.name)
            .order_by(func.count(Ticket.id).desc()),
            scope,
        )
        return [(name, count) for name, count in self.session.execute(stmt)]

    def daily_volume_since(self, scope: Scope, since: datetime) -> dict[date, int]:
        """Chamados abertos por dia (UTC)."""
        day = func.date(Ticket.created_at)
        stmt = self._filter(
            select(day, func.count()).select_from(Ticket).where(Ticket.created_at >= since),
            scope,
        ).group_by(day)
        result: dict[date, int] = {}
        for value, count in self.session.execute(stmt):
            # SQLite devolve texto ("2026-10-07"); MySQL devolve `date`.
            parsed = value if isinstance(value, date) else date.fromisoformat(str(value))
            result[parsed] = count
        return result

    def resolved_since(self, scope: Scope, since: datetime) -> Sequence[Ticket]:
        """Chamados resolvidos no período (base de tempo médio e cumprimento de SLA)."""
        stmt = self._filter(
            select(Ticket)
            .where(Ticket.resolved_at.is_not(None), Ticket.resolved_at >= since)
            .options(joinedload(Ticket.technician)),
            scope,
        )
        return self.session.scalars(stmt).unique().all()

    def ratings_since(self, scope: Scope, since: datetime) -> list[tuple[int, int | None]]:
        """(nota, técnico) das avaliações registradas no período."""
        stmt = self._filter(
            select(TicketRating.rating, Ticket.technician_id)
            .select_from(TicketRating)
            .join(Ticket, Ticket.id == TicketRating.ticket_id)
            .where(TicketRating.created_at >= since),
            scope,
        )
        return [(rating, technician_id) for rating, technician_id in self.session.execute(stmt)]

    def recent_tickets(self, scope: Scope, limit: int = 5) -> Sequence[Ticket]:
        stmt = self._filter(
            select(Ticket)
            .options(
                joinedload(Ticket.requester),
                joinedload(Ticket.technician),
                joinedload(Ticket.category),
            )
            .order_by(Ticket.updated_at.desc(), Ticket.id.desc())
            .limit(limit),
            scope,
        )
        return self.session.scalars(stmt).unique().all()

    def recent_activity(self, scope: Scope, limit: int = 8) -> Sequence[TicketHistory]:
        stmt = self._filter(
            select(TicketHistory)
            .join(Ticket, Ticket.id == TicketHistory.ticket_id)
            .options(joinedload(TicketHistory.user), joinedload(TicketHistory.ticket))
            .order_by(TicketHistory.created_at.desc(), TicketHistory.id.desc())
            .limit(limit),
            scope,
        )
        return self.session.scalars(stmt).unique().all()

    def staff_names(self, company_id: int, ids: set[int]) -> dict[int, str]:
        if not ids:
            return {}
        stmt = select(User.id, User.name).where(
            User.company_id == _require_company_id(company_id), User.id.in_(ids)
        )
        return {user_id: name for user_id, name in self.session.execute(stmt)}
