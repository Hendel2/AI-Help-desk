"""Dashboard (§39–41): números exatos, recorte por perfil e isolamento por empresa."""

from collections.abc import Callable
from datetime import datetime, timedelta
from itertools import count
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Company, Ticket, TicketRating, User
from app.models.enums import RoleName, TicketPriority, TicketStatus
from app.models.types import utcnow
from app.services.dashboard import DashboardService

_numbers = count(1)


@pytest.fixture
def company(make_company: Callable[..., Company]) -> Company:
    return make_company(name="Empresa Alfa")


@pytest.fixture
def people(
    company: Company, make_user: Callable[..., User], db_session: Session
) -> dict[str, User]:
    users = {
        "ana": make_user(company, role=RoleName.USER, name="Ana"),
        "bruno": make_user(company, role=RoleName.USER, name="Bruno"),
        "teo": make_user(company, role=RoleName.TECHNICIAN, name="Téo"),
        "tania": make_user(company, role=RoleName.TECHNICIAN, name="Tânia"),
        "alice": make_user(company, role=RoleName.ADMIN, name="Alice"),
    }
    db_session.commit()
    return users


@pytest.fixture
def insert_ticket(db_session: Session) -> Callable[..., Ticket]:
    """Chamado com datas controladas (sem passar pelo serviço)."""

    def _insert(
        requester: User,
        *,
        opened_hours_ago: float = 1,
        status: TicketStatus = TicketStatus.OPEN,
        technician: User | None = None,
        priority: TicketPriority = TicketPriority.MEDIUM,
        response_minutes: int | None = None,
        resolution_minutes: int | None = None,
        resolved_after_minutes: int | None = None,
    ) -> Ticket:
        opened = utcnow() - timedelta(hours=opened_hours_ago)
        ticket = Ticket(
            company_id=requester.company_id,
            ticket_number=f"HD-{next(_numbers):06d}",
            user_id=requester.id,
            technician_id=technician.id if technician else None,
            title="Chamado de teste",
            description="Descrição do chamado de teste.",
            priority=priority,
            status=status,
            created_at=opened,
            updated_at=opened,
            response_deadline=(
                opened + timedelta(minutes=response_minutes) if response_minutes else None
            ),
            resolution_deadline=(
                opened + timedelta(minutes=resolution_minutes) if resolution_minutes else None
            ),
            resolved_at=(
                opened + timedelta(minutes=resolved_after_minutes)
                if resolved_after_minutes is not None
                else None
            ),
        )
        if ticket.resolved_at is not None:
            ticket.first_response_at = ticket.resolved_at
        db_session.add(ticket)
        db_session.flush()
        return ticket

    return _insert


def test_user_metrics_only_count_their_own_tickets(
    db_session: Session, people: dict[str, User], insert_ticket: Callable[..., Ticket]
) -> None:
    insert_ticket(people["ana"])
    insert_ticket(people["ana"], status=TicketStatus.IN_PROGRESS, technician=people["teo"])
    insert_ticket(
        people["ana"],
        status=TicketStatus.CLOSED,
        technician=people["teo"],
        resolved_after_minutes=30,
    )
    insert_ticket(people["bruno"])  # de outro usuário: não entra

    metrics = DashboardService(db_session).metrics(people["ana"], days=30)

    assert (metrics.open, metrics.in_progress, metrics.resolved) == (2, 1, 1)
    assert metrics.created_in_period == 3
    assert metrics.scope is RoleName.USER
    # Campos de equipe e gestão não se aplicam ao usuário.
    assert metrics.assigned_to_me is None
    assert metrics.sla_compliance_pct is None


def test_staff_metrics_count_sla_risk_of_open_tickets(
    db_session: Session, people: dict[str, User], insert_ticket: Callable[..., Ticket]
) -> None:
    # 60 min de prazo de resposta:
    insert_ticket(people["ana"], opened_hours_ago=0.1, response_minutes=60)  # no prazo
    insert_ticket(people["ana"], opened_hours_ago=0.9, response_minutes=60)  # alerta (90%)
    insert_ticket(people["bruno"], opened_hours_ago=2, response_minutes=60)  # vencido
    insert_ticket(
        people["bruno"],
        opened_hours_ago=2,
        status=TicketStatus.IN_PROGRESS,
        technician=people["teo"],
    )

    metrics = DashboardService(db_session).metrics(people["teo"], days=30)

    assert metrics.open == 4
    assert (metrics.sla_warning, metrics.sla_breached) == (1, 1)
    assert metrics.assigned_to_me == 1
    assert metrics.satisfaction_avg is None  # gestão é só do ADMIN


def test_admin_metrics_compute_resolution_time_sla_compliance_and_satisfaction(
    db_session: Session, people: dict[str, User], insert_ticket: Callable[..., Ticket]
) -> None:
    on_time = insert_ticket(
        people["ana"],
        opened_hours_ago=10,
        status=TicketStatus.CLOSED,
        technician=people["teo"],
        resolution_minutes=120,
        resolved_after_minutes=60,
    )
    insert_ticket(
        people["bruno"],
        opened_hours_ago=10,
        status=TicketStatus.RESOLVED,
        technician=people["tania"],
        resolution_minutes=120,
        resolved_after_minutes=180,  # fora do prazo
    )
    db_session.add_all(
        [
            TicketRating(ticket_id=on_time.id, user_id=people["ana"].id, rating=5),
        ]
    )
    db_session.flush()

    metrics = DashboardService(db_session).metrics(people["alice"], days=30)

    assert metrics.avg_resolution_minutes == 120.0  # (60 + 180) / 2
    assert metrics.sla_compliance_pct == 50.0
    assert (metrics.satisfaction_avg, metrics.satisfaction_count) == (5.0, 1)


def test_tickets_distribution_volume_and_technician_performance(
    db_session: Session, people: dict[str, User], insert_ticket: Callable[..., Ticket]
) -> None:
    insert_ticket(people["ana"], priority=TicketPriority.HIGH)
    insert_ticket(people["ana"], priority=TicketPriority.HIGH)
    insert_ticket(people["ana"], priority=TicketPriority.CRITICAL, opened_hours_ago=50)
    insert_ticket(
        people["bruno"],
        status=TicketStatus.CLOSED,
        technician=people["teo"],
        resolved_after_minutes=30,
    )

    result = DashboardService(db_session).tickets(people["alice"], days=7)

    by_priority = {item.label: item.count for item in result.by_priority}
    assert by_priority == {"LOW": 0, "MEDIUM": 0, "HIGH": 2, "CRITICAL": 1}  # só em aberto
    assert len(result.daily_volume) == 8  # 7 dias atrás até hoje
    assert sum(day.count for day in result.daily_volume) == 4
    assert result.by_category == [result.by_category[0]]
    assert result.by_category[0].label == "Sem categoria"
    assert result.technicians is not None
    assert [(t.technician.name, t.resolved) for t in result.technicians] == [("Téo", 1)]


def test_only_admin_receives_technician_performance(
    db_session: Session, people: dict[str, User], insert_ticket: Callable[..., Ticket]
) -> None:
    insert_ticket(people["ana"])

    assert DashboardService(db_session).tickets(people["teo"], days=30).technicians is None


def test_sla_evolution_groups_resolutions_by_week(
    db_session: Session, people: dict[str, User], insert_ticket: Callable[..., Ticket]
) -> None:
    now = datetime(2026, 10, 7, 12, tzinfo=utcnow().tzinfo)  # quarta-feira
    service = DashboardService(db_session)
    for hours_ago, resolved_after in ((1, 30), (2, 300)):
        ticket = insert_ticket(
            people["ana"],
            status=TicketStatus.RESOLVED,
            technician=people["teo"],
            resolution_minutes=120,
            resolved_after_minutes=resolved_after,
        )
        ticket.created_at = now - timedelta(hours=hours_ago + resolved_after / 60)
        ticket.resolution_deadline = ticket.created_at + timedelta(minutes=120)
        ticket.resolved_at = ticket.created_at + timedelta(minutes=resolved_after)
    db_session.flush()

    weeks = service.sla_evolution(people["alice"], weeks=4, now=now).weeks

    assert len(weeks) == 4
    assert str(weeks[-1].week_start) == "2026-10-05"  # segunda-feira
    assert (weeks[-1].resolved, weeks[-1].within_sla, weeks[-1].compliance_pct) == (2, 1, 50.0)
    assert weeks[0].compliance_pct is None


class TestEndpoints:
    def test_returns_company_scoped_data_only(
        self,
        client: TestClient,
        db_session: Session,
        people: dict[str, User],
        make_company: Callable[..., Company],
        make_user: Callable[..., User],
        insert_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        insert_ticket(people["ana"])
        foreign_user = make_user(make_company(name="Beta"), role=RoleName.USER)
        for _ in range(3):
            insert_ticket(foreign_user)
        db_session.commit()

        response = client.get("/api/v1/dashboard/metrics", headers=auth_headers(people["alice"]))

        assert response.status_code == 200
        assert response.json()["open"] == 1

    def test_activity_hides_internal_comments_from_requesters(
        self,
        client: TestClient,
        db_session: Session,
        people: dict[str, User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(people["ana"])
        db_session.commit()
        client.post(
            f"/api/v1/tickets/{ticket.id}/comments",
            json={"content": "Nota interna", "is_internal": True},
            headers=auth_headers(people["teo"]),
        )

        as_user = client.get("/api/v1/dashboard/tickets", headers=auth_headers(people["ana"]))
        as_staff = client.get("/api/v1/dashboard/tickets", headers=auth_headers(people["teo"]))

        assert [item["action"] for item in as_user.json()["activity"]] == ["CREATED"]
        assert {item["action"] for item in as_staff.json()["activity"]} == {"CREATED", "COMMENTED"}

    @pytest.mark.parametrize("query", ["days=0", "days=91", "days=abc"])
    def test_validates_the_period(
        self,
        client: TestClient,
        people: dict[str, User],
        auth_headers: Callable[[User], dict[str, str]],
        query: str,
    ) -> None:
        response = client.get(
            f"/api/v1/dashboard/metrics?{query}", headers=auth_headers(people["alice"])
        )

        assert response.status_code == 422

    def test_requires_authentication(self, client: TestClient) -> None:
        for path in ("metrics", "tickets", "sla"):
            assert client.get(f"/api/v1/dashboard/{path}").status_code == 401

    def test_works_with_the_demo_dataset(
        self,
        client: TestClient,
        db_session: Session,
        seed_roles: dict[RoleName, Any],
    ) -> None:
        from app.cli.seed_demo import seed

        seed(db_session)
        token = client.post(
            "/api/v1/auth/login", json={"email": "admin@demo.helpdesk", "password": "demo12345"}
        ).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        metrics = client.get("/api/v1/dashboard/metrics", headers=headers).json()
        tickets = client.get("/api/v1/dashboard/tickets", headers=headers).json()
        evolution = client.get("/api/v1/dashboard/sla?weeks=6", headers=headers).json()

        assert metrics["created_in_period"] > 0
        assert 0 <= metrics["sla_compliance_pct"] <= 100
        assert 1 <= metrics["satisfaction_avg"] <= 5
        assert len(tickets["recent"]) == 5
        assert tickets["technicians"]
        assert len(evolution["weeks"]) == 6
