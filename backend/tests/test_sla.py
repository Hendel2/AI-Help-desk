"""Testes do cálculo de SLA (§21) — sem banco."""

from datetime import timedelta

import pytest

from app.models import Category, SLAPolicy, Ticket
from app.models.enums import SLAStatus, TicketPriority, TicketStatus
from app.models.types import utcnow
from app.services import sla


def make_policy(
    policy_id: int,
    *,
    response: int,
    resolution: int,
    priority: TicketPriority | None = None,
) -> SLAPolicy:
    policy = SLAPolicy(
        name=f"Política {policy_id}",
        priority=priority,
        response_time_minutes=response,
        resolution_time_minutes=resolution,
    )
    policy.id = policy_id
    return policy


def make_ticket(*, opened_minutes_ago: int = 0, **fields: object) -> Ticket:
    opened_at = utcnow() - timedelta(minutes=opened_minutes_ago)
    ticket = Ticket(
        title="t", description="d", created_at=opened_at, updated_at=opened_at, **fields
    )
    return ticket


class TestResolvePolicy:
    def test_prefers_the_category_policy(self) -> None:
        category_policy = make_policy(1, response=15, resolution=120)
        fallback = make_policy(2, response=480, resolution=2880, priority=TicketPriority.LOW)
        category = Category(name="Rede", default_sla_policy_id=1)

        chosen = sla.resolve_policy(category, TicketPriority.LOW, [category_policy, fallback])

        assert chosen is category_policy

    def test_falls_back_to_the_company_policy_for_the_priority(self) -> None:
        fallback = make_policy(2, response=60, resolution=480, priority=TicketPriority.HIGH)
        category = Category(name="Rede", default_sla_policy_id=None)

        assert sla.resolve_policy(category, TicketPriority.HIGH, [fallback]) is fallback
        assert sla.resolve_policy(None, TicketPriority.HIGH, [fallback]) is fallback

    def test_returns_none_without_any_applicable_policy(self) -> None:
        fallback = make_policy(2, response=60, resolution=480, priority=TicketPriority.HIGH)

        assert sla.resolve_policy(None, TicketPriority.LOW, [fallback]) is None
        assert sla.resolve_policy(None, TicketPriority.LOW, []) is None

    def test_ignores_a_category_policy_that_is_not_active(self) -> None:
        """A categoria aponta para uma política inativa (fora da lista de ativas)."""
        fallback = make_policy(2, response=60, resolution=480, priority=TicketPriority.HIGH)
        category = Category(name="Rede", default_sla_policy_id=99)

        assert sla.resolve_policy(category, TicketPriority.HIGH, [fallback]) is fallback


class TestComputeDeadlines:
    def test_adds_the_policy_minutes_to_the_opening(self) -> None:
        opened_at = utcnow()
        policy = make_policy(1, response=60, resolution=480)

        response_deadline, resolution_deadline = sla.compute_deadlines(policy, opened_at)

        assert response_deadline == opened_at + timedelta(minutes=60)
        assert resolution_deadline == opened_at + timedelta(minutes=480)

    def test_without_policy_there_is_no_deadline(self) -> None:
        assert sla.compute_deadlines(None, utcnow()) == (None, None)


class TestEvaluate:
    def test_without_policy_the_sla_is_undefined(self) -> None:
        info = sla.evaluate(make_ticket())

        assert info.status is None
        assert info.response.status is None
        assert info.resolution.remaining_seconds is None

    def test_on_time_in_the_beginning_of_the_window(self) -> None:
        ticket = make_ticket(opened_minutes_ago=10)
        ticket.response_deadline = ticket.created_at + timedelta(minutes=60)
        ticket.resolution_deadline = ticket.created_at + timedelta(minutes=480)

        info = sla.evaluate(ticket)

        assert info.status is SLAStatus.ON_TIME
        assert 2900 < info.response.remaining_seconds < 3100  # ~50 min

    def test_warning_in_the_last_fifth_of_the_window(self) -> None:
        ticket = make_ticket(opened_minutes_ago=50)
        ticket.response_deadline = ticket.created_at + timedelta(minutes=60)

        info = sla.evaluate(ticket)

        assert info.response.status is SLAStatus.WARNING
        assert info.status is SLAStatus.WARNING

    def test_breached_after_the_deadline(self) -> None:
        ticket = make_ticket(opened_minutes_ago=90)
        ticket.response_deadline = ticket.created_at + timedelta(minutes=60)

        info = sla.evaluate(ticket)

        assert info.response.status is SLAStatus.BREACHED
        assert info.response.remaining_seconds < 0

    def test_answered_within_the_deadline_stays_on_time_forever(self) -> None:
        ticket = make_ticket(opened_minutes_ago=600)
        ticket.response_deadline = ticket.created_at + timedelta(minutes=60)
        ticket.first_response_at = ticket.created_at + timedelta(minutes=30)

        info = sla.evaluate(ticket)

        assert info.response.status is SLAStatus.ON_TIME

    def test_answered_after_the_deadline_stays_breached(self) -> None:
        ticket = make_ticket(opened_minutes_ago=600)
        ticket.response_deadline = ticket.created_at + timedelta(minutes=60)
        ticket.first_response_at = ticket.created_at + timedelta(minutes=90)

        info = sla.evaluate(ticket)

        assert info.response.status is SLAStatus.BREACHED

    @pytest.mark.parametrize(
        ("response_minutes_ago", "expected"),
        [(30, SLAStatus.ON_TIME), (90, SLAStatus.BREACHED)],
    )
    def test_overall_status_is_the_worst_of_the_two_clocks(
        self, response_minutes_ago: int, expected: SLAStatus
    ) -> None:
        ticket = make_ticket(opened_minutes_ago=100)
        ticket.response_deadline = ticket.created_at + timedelta(minutes=60)
        ticket.first_response_at = ticket.created_at + timedelta(minutes=response_minutes_ago)
        ticket.resolution_deadline = ticket.created_at + timedelta(minutes=480)

        assert sla.evaluate(ticket).status is expected

    def test_cancelled_ticket_has_no_sla(self) -> None:
        ticket = make_ticket(opened_minutes_ago=600, status=TicketStatus.CANCELLED)
        ticket.response_deadline = ticket.created_at + timedelta(minutes=60)
        ticket.resolution_deadline = ticket.created_at + timedelta(minutes=120)

        info = sla.evaluate(ticket)

        assert info.status is None
        assert info.resolution.status is None
