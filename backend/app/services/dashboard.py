"""Indicadores do dashboard por perfil (§39–41).

- USER: apenas os próprios chamados.
- TECHNICIAN: fila da empresa, SLA em risco e a própria carga.
- ADMIN: tudo do técnico + tempo de resolução, satisfação, cumprimento de SLA
  e desempenho por técnico.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Ticket, User
from app.models.enums import RoleName, SLAStatus, TicketPriority, TicketStatus
from app.models.types import utcnow
from app.repositories.dashboard import ACTIVE_STATUSES, DashboardRepository, Scope
from app.repositories.ticket import INTERNAL_COMMENT_FIELD
from app.schemas.dashboard import (
    ActivityItem,
    CountItem,
    DailyCount,
    DashboardMetrics,
    DashboardSLA,
    DashboardTickets,
    RecentTicket,
    SLAWeek,
    TechnicianPerformance,
)
from app.schemas.ticket import CategorySummary, UserSummary
from app.services import sla
from app.services.tickets import is_staff

PRIORITY_ORDER = list(TicketPriority)


def _minutes(start: datetime, end: datetime) -> float:
    return (end - start).total_seconds() / 60


def _average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


class DashboardService:
    def __init__(self, session: Session) -> None:
        self.repo = DashboardRepository(session)

    def _scope(self, user: User) -> Scope:
        if is_staff(user):
            return Scope(company_id=user.company_id)
        return Scope(company_id=user.company_id, requester_id=user.id)

    # --- Indicadores ---------------------------------------------------------

    def metrics(self, user: User, *, days: int, now: datetime | None = None) -> DashboardMetrics:
        now = now or utcnow()
        since = now - timedelta(days=days)
        scope = self._scope(user)
        by_status = self.repo.count_by_status(scope)
        active = self.repo.active_tickets(scope)
        sla_states = [sla.evaluate(ticket, now=now).status for ticket in active]

        metrics = DashboardMetrics(
            scope=user.role.name,
            period_days=days,
            open=sum(by_status.get(status, 0) for status in ACTIVE_STATUSES),
            in_progress=by_status.get(TicketStatus.IN_PROGRESS, 0),
            waiting_user=by_status.get(TicketStatus.WAITING_USER, 0),
            resolved=by_status.get(TicketStatus.RESOLVED, 0)
            + by_status.get(TicketStatus.CLOSED, 0),
            created_in_period=self.repo.count_created_since(scope, since),
            sla_warning=sla_states.count(SLAStatus.WARNING),
            sla_breached=sla_states.count(SLAStatus.BREACHED),
        )
        if is_staff(user):
            metrics.assigned_to_me = sum(1 for t in active if t.technician_id == user.id)
        if user.role.name is RoleName.ADMIN:
            resolved = self.repo.resolved_since(scope, since)
            ratings = [rating for rating, _ in self.repo.ratings_since(scope, since)]
            with_deadline = [t for t in resolved if t.resolution_deadline is not None]
            within = [t for t in with_deadline if t.resolved_at <= t.resolution_deadline]  # type: ignore[operator]
            metrics.avg_resolution_minutes = _average(
                [_minutes(t.created_at, t.resolved_at) for t in resolved]  # type: ignore[arg-type]
            )
            metrics.satisfaction_avg = _average([float(r) for r in ratings])
            metrics.satisfaction_count = len(ratings)
            metrics.sla_compliance_pct = (
                round(100 * len(within) / len(with_deadline), 1) if with_deadline else None
            )
        return metrics

    # --- Chamados: distribuições, recentes e atividade ------------------------

    def tickets(self, user: User, *, days: int, now: datetime | None = None) -> DashboardTickets:
        now = now or utcnow()
        since = now - timedelta(days=days)
        scope = self._scope(user)

        by_priority = self.repo.count_active_by_priority(scope)
        volume = self.repo.daily_volume_since(scope, since)
        first_day = since.date()
        daily = [
            DailyCount(date=day, count=volume.get(day, 0))
            for day in (first_day + timedelta(days=offset) for offset in range(days + 1))
            if day <= now.date()
        ]

        activity = [
            entry
            for entry in self.repo.recent_activity(scope, limit=12)
            # Solicitantes não veem registros de comentários internos.
            if is_staff(user) or entry.field != INTERNAL_COMMENT_FIELD
        ][:8]

        result = DashboardTickets(
            period_days=days,
            by_priority=[
                CountItem(label=priority.value, count=by_priority.get(priority, 0))
                for priority in PRIORITY_ORDER
            ],
            by_category=[
                CountItem(label=name, count=count)
                for name, count in self.repo.count_by_category_since(scope, since)
            ],
            daily_volume=daily,
            recent=[self._recent(ticket) for ticket in self.repo.recent_tickets(scope)],
            activity=[
                ActivityItem(
                    id=entry.id,
                    action=entry.action,
                    field=entry.field,
                    old_value=entry.old_value,
                    new_value=entry.new_value,
                    created_at=entry.created_at,
                    user=UserSummary.model_validate(entry.user) if entry.user else None,
                    ticket_id=entry.ticket_id,
                    ticket_number=entry.ticket.ticket_number,
                )
                for entry in activity
            ],
        )
        if user.role.name is RoleName.ADMIN:
            result.technicians = self._technician_performance(scope, since)
        return result

    def _recent(self, ticket: Ticket) -> RecentTicket:
        return RecentTicket(
            id=ticket.id,
            ticket_number=ticket.ticket_number,
            title=ticket.title,
            status=ticket.status,
            priority=ticket.priority,
            updated_at=ticket.updated_at,
            requester=UserSummary.model_validate(ticket.requester),
            technician=UserSummary.model_validate(ticket.technician) if ticket.technician else None,
            category=CategorySummary.model_validate(ticket.category) if ticket.category else None,
        )

    def _technician_performance(self, scope: Scope, since: datetime) -> list[TechnicianPerformance]:
        durations: dict[int, list[float]] = defaultdict(list)
        people: dict[int, User] = {}
        for ticket in self.repo.resolved_since(scope, since):
            if ticket.technician is None or ticket.resolved_at is None:
                continue
            durations[ticket.technician.id].append(_minutes(ticket.created_at, ticket.resolved_at))
            people[ticket.technician.id] = ticket.technician

        ratings: dict[int, list[float]] = defaultdict(list)
        for rating, technician_id in self.repo.ratings_since(scope, since):
            if technician_id is not None:
                ratings[technician_id].append(float(rating))

        performance = [
            TechnicianPerformance(
                technician=UserSummary.model_validate(people[technician_id]),
                resolved=len(values),
                avg_resolution_minutes=_average(values),
                satisfaction_avg=_average(ratings.get(technician_id, [])),
            )
            for technician_id, values in durations.items()
        ]
        return sorted(performance, key=lambda item: item.resolved, reverse=True)

    # --- Evolução do SLA ----------------------------------------------------

    def sla_evolution(self, user: User, *, weeks: int, now: datetime | None = None) -> DashboardSLA:
        now = now or utcnow()
        current_week = now.date() - timedelta(days=now.weekday())  # segunda-feira
        first_week = current_week - timedelta(weeks=weeks - 1)
        since = datetime.combine(first_week, datetime.min.time(), tzinfo=now.tzinfo)

        buckets: dict[date, list[bool]] = defaultdict(list)
        for ticket in self.repo.resolved_since(self._scope(user), since):
            if ticket.resolution_deadline is None or ticket.resolved_at is None:
                continue
            resolved_day = ticket.resolved_at.date()
            week = resolved_day - timedelta(days=resolved_day.weekday())
            buckets[week].append(ticket.resolved_at <= ticket.resolution_deadline)

        series = []
        for index in range(weeks):
            week = first_week + timedelta(weeks=index)
            results = buckets.get(week, [])
            within = sum(results)
            series.append(
                SLAWeek(
                    week_start=week,
                    resolved=len(results),
                    within_sla=within,
                    compliance_pct=round(100 * within / len(results), 1) if results else None,
                )
            )
        return DashboardSLA(weeks=series)
