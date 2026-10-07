"""Cálculo de SLA (especificação §21).

Regras:
- a política vem da categoria do chamado (`categories.default_sla_policy_id`);
- sem política na categoria, usa-se a política da empresa cuja `priority` é a do
  chamado (fallback), se existir e estiver ativa;
- sem nenhuma das duas o chamado não tem prazo e o SLA fica indefinido.

Prazos são sempre calculados a partir da abertura do chamado, em UTC.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.models import Category, SLAPolicy, Ticket
from app.models.enums import SLAStatus, TicketPriority, TicketStatus
from app.models.types import utcnow

# Fração final do prazo em que o chamado entra em alerta (§21: "próximo do vencimento").
WARNING_THRESHOLD = 0.2


@dataclass(frozen=True)
class SLAClock:
    """Estado de um prazo (resposta ou resolução)."""

    deadline: datetime | None
    completed_at: datetime | None
    status: SLAStatus | None
    """`None` quando o chamado não tem política de SLA."""
    remaining_seconds: int | None
    """Segundos até o prazo; negativo quando já venceu. `None` sem prazo."""


@dataclass(frozen=True)
class SLAInfo:
    response: SLAClock
    resolution: SLAClock
    status: SLAStatus | None
    """Pior estado entre resposta e resolução — é o exibido na listagem."""


def resolve_policy(
    category: Category | None,
    priority: TicketPriority,
    fallback_policies: list[SLAPolicy],
) -> SLAPolicy | None:
    """Política aplicável. `fallback_policies` são as políticas ativas da empresa."""
    if category is not None and category.default_sla_policy_id is not None:
        for policy in fallback_policies:
            if policy.id == category.default_sla_policy_id:
                return policy
    for policy in fallback_policies:
        if policy.priority == priority:
            return policy
    return None


def compute_deadlines(
    policy: SLAPolicy | None, opened_at: datetime
) -> tuple[datetime | None, datetime | None]:
    if policy is None:
        return None, None
    return (
        opened_at + timedelta(minutes=policy.response_time_minutes),
        opened_at + timedelta(minutes=policy.resolution_time_minutes),
    )


def _clock(
    opened_at: datetime,
    deadline: datetime | None,
    completed_at: datetime | None,
    now: datetime,
) -> SLAClock:
    if deadline is None:
        return SLAClock(
            deadline=None, completed_at=completed_at, status=None, remaining_seconds=None
        )

    reference = completed_at or now
    remaining = int((deadline - reference).total_seconds())

    if remaining < 0:
        status = SLAStatus.BREACHED
    elif completed_at is not None:
        # Cumprido dentro do prazo: não há mais alerta a dar.
        status = SLAStatus.ON_TIME
    else:
        total = (deadline - opened_at).total_seconds()
        status = (
            SLAStatus.WARNING
            if total > 0 and remaining <= total * WARNING_THRESHOLD
            else SLAStatus.ON_TIME
        )

    return SLAClock(
        deadline=deadline,
        completed_at=completed_at,
        status=status,
        remaining_seconds=remaining,
    )


# Pior estado primeiro: define o SLA exibido quando resposta e resolução divergem.
_SEVERITY = {SLAStatus.BREACHED: 3, SLAStatus.WARNING: 2, SLAStatus.ON_TIME: 1}


def evaluate(ticket: Ticket, *, now: datetime | None = None) -> SLAInfo:
    """Estado atual do SLA do chamado."""
    if ticket.status is TicketStatus.CANCELLED:
        # Cancelado não é atendido nem resolvido: o SLA deixa de se aplicar.
        stopped = SLAClock(deadline=None, completed_at=None, status=None, remaining_seconds=None)
        return SLAInfo(response=stopped, resolution=stopped, status=None)
    now = now or utcnow()
    response = _clock(ticket.created_at, ticket.response_deadline, ticket.first_response_at, now)
    resolution = _clock(ticket.created_at, ticket.resolution_deadline, ticket.resolved_at, now)

    known = [clock.status for clock in (response, resolution) if clock.status is not None]
    overall = max(known, key=lambda status: _SEVERITY[status]) if known else None
    return SLAInfo(response=response, resolution=resolution, status=overall)
