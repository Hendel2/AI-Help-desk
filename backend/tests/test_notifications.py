"""Notificações (§22): destinatários por evento, caixa de entrada e alertas de SLA."""

from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Company, Notification, Ticket, User
from app.models.enums import NotificationType, RoleName, TicketPriority, TicketStatus
from app.models.types import utcnow
from app.services.notifications import NotificationService


@pytest.fixture
def company(make_company: Callable[..., Company]) -> Company:
    return make_company(name="Empresa Alfa")


@pytest.fixture
def people(
    company: Company, make_user: Callable[..., User], db_session: Session
) -> dict[str, User]:
    users = {
        "ana": make_user(company, role=RoleName.USER, name="Ana"),
        "teo": make_user(company, role=RoleName.TECHNICIAN, name="Téo"),
        "tania": make_user(company, role=RoleName.TECHNICIAN, name="Tânia"),
        "alice": make_user(company, role=RoleName.ADMIN, name="Alice"),
    }
    db_session.commit()
    return users


def inbox(db_session: Session, user: User) -> list[NotificationType]:
    db_session.expire_all()
    return [
        n.type
        for n in db_session.scalars(
            select(Notification).where(Notification.user_id == user.id).order_by(Notification.id)
        )
    ]


def test_new_ticket_notifies_the_whole_support_team(
    db_session: Session, people: dict[str, User], make_ticket: Callable[..., Ticket]
) -> None:
    make_ticket(people["ana"])

    for name in ("teo", "tania", "alice"):
        assert inbox(db_session, people[name]) == [NotificationType.TICKET_CREATED]
    assert inbox(db_session, people["ana"]) == []  # quem abriu não é notificado


def test_new_ticket_never_notifies_another_company(
    db_session: Session,
    people: dict[str, User],
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
    make_ticket: Callable[..., Ticket],
) -> None:
    outsider = make_user(make_company(name="Beta"), role=RoleName.TECHNICIAN)
    db_session.commit()

    make_ticket(people["ana"])

    assert inbox(db_session, outsider) == []


def test_lifecycle_notifies_the_right_people(
    client: TestClient,
    db_session: Session,
    people: dict[str, User],
    make_ticket: Callable[..., Ticket],
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    ticket = make_ticket(people["ana"])
    db_session.commit()
    admin, tech, requester = (auth_headers(people[n]) for n in ("alice", "teo", "ana"))
    base = f"/api/v1/tickets/{ticket.id}"

    client.post(f"{base}/assign", json={"technician_id": people["teo"].id}, headers=admin)
    client.post(
        f"{base}/comments", json={"content": "Nota interna", "is_internal": True}, headers=admin
    )
    client.post(f"{base}/comments", json={"content": "Ainda sem acesso."}, headers=requester)
    client.post(f"{base}/status", json={"status": "IN_PROGRESS"}, headers=tech)
    client.post(f"{base}/resolve", json={"solution": "Credenciais renovadas."}, headers=tech)

    assert inbox(db_session, people["ana"]) == [
        NotificationType.TICKET_ASSIGNED,
        # Solução chega como "resolvido", não como "nova mensagem" duplicada.
        NotificationType.TICKET_RESOLVED,
    ]
    assert inbox(db_session, people["teo"]) == [
        NotificationType.TICKET_CREATED,
        NotificationType.TICKET_ASSIGNED,
        NotificationType.COMMENT_ADDED,  # interno, do admin
        NotificationType.COMMENT_ADDED,  # do solicitante
    ]
    # Quem não está no chamado só recebeu o aviso de abertura.
    assert inbox(db_session, people["tania"]) == [NotificationType.TICKET_CREATED]


def test_internal_comment_never_notifies_the_requester(
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
        json={"content": "Suspeita de fraude", "is_internal": True},
        headers=auth_headers(people["teo"]),
    )

    assert inbox(db_session, people["ana"]) == []


class TestInbox:
    def test_lists_counts_and_marks_as_read(
        self,
        client: TestClient,
        db_session: Session,
        people: dict[str, User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        make_ticket(people["ana"], title="Primeiro chamado")
        make_ticket(people["ana"], title="Segundo chamado")
        db_session.commit()
        headers = auth_headers(people["teo"])

        listing = client.get("/api/v1/notifications", headers=headers).json()
        assert listing["total"] == 2
        assert listing["items"][0]["title"] == "Novo chamado HD-000002"  # mais recente primeiro
        assert client.get("/api/v1/notifications/unread-count", headers=headers).json() == {
            "unread": 2
        }

        first = listing["items"][0]["id"]
        read = client.post(f"/api/v1/notifications/{first}/read", headers=headers).json()
        assert read["is_read"] is True and read["read_at"] is not None
        assert client.get("/api/v1/notifications?unread=true", headers=headers).json()["total"] == 1

        assert client.post("/api/v1/notifications/read-all", headers=headers).json() == {
            "updated": 1
        }
        assert client.get("/api/v1/notifications/unread-count", headers=headers).json() == {
            "unread": 0
        }

    def test_cannot_read_someone_elses_notification(
        self,
        client: TestClient,
        db_session: Session,
        people: dict[str, User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        make_ticket(people["ana"])
        db_session.commit()
        notification = db_session.scalars(
            select(Notification).where(Notification.user_id == people["teo"].id)
        ).one()

        response = client.post(
            f"/api/v1/notifications/{notification.id}/read", headers=auth_headers(people["tania"])
        )

        assert response.status_code == 404
        db_session.expire_all()
        assert db_session.get(Notification, notification.id).is_read is False  # type: ignore[union-attr]


class TestSLAMonitor:
    def _ticket_with_deadline(
        self, db_session: Session, requester: User, *, minutes_ago: int, technician: User | None
    ) -> Ticket:
        opened = utcnow() - timedelta(minutes=minutes_ago)
        ticket = Ticket(
            company_id=requester.company_id,
            ticket_number=f"HD-9{minutes_ago:05d}",
            user_id=requester.id,
            technician_id=technician.id if technician else None,
            title="VPN fora do ar",
            description="Sem acesso à VPN.",
            priority=TicketPriority.HIGH,
            status=TicketStatus.ASSIGNED if technician else TicketStatus.OPEN,
            created_at=opened,
            updated_at=opened,
            response_deadline=opened + timedelta(minutes=60),
            resolution_deadline=opened + timedelta(minutes=480),
        )
        db_session.add(ticket)
        db_session.commit()
        return ticket

    def test_warns_the_technician_once(self, db_session: Session, people: dict[str, User]) -> None:
        self._ticket_with_deadline(
            db_session, people["ana"], minutes_ago=55, technician=people["teo"]
        )
        service = NotificationService(db_session)

        assert service.scan_sla_alerts() == 1
        assert service.scan_sla_alerts() == 0  # não repete o mesmo alerta
        assert inbox(db_session, people["teo"]) == [NotificationType.SLA_WARNING]
        assert inbox(db_session, people["alice"]) == []

    def test_breach_alerts_the_whole_team_when_unassigned_and_the_admins(
        self, db_session: Session, people: dict[str, User]
    ) -> None:
        self._ticket_with_deadline(db_session, people["ana"], minutes_ago=90, technician=None)

        NotificationService(db_session).scan_sla_alerts()

        for name in ("teo", "tania", "alice"):
            assert inbox(db_session, people[name]) == [NotificationType.SLA_BREACHED]
        assert inbox(db_session, people["ana"]) == []

    def test_resolved_or_on_time_tickets_are_ignored(
        self, db_session: Session, people: dict[str, User]
    ) -> None:
        self._ticket_with_deadline(
            db_session, people["ana"], minutes_ago=5, technician=people["teo"]
        )
        late = self._ticket_with_deadline(
            db_session, people["ana"], minutes_ago=600, technician=people["teo"]
        )
        late.status = TicketStatus.RESOLVED
        late.resolved_at = utcnow()
        db_session.commit()

        assert NotificationService(db_session).scan_sla_alerts() == 0


def test_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/notifications").status_code == 401
    assert client.get("/api/v1/notifications/unread-count").status_code == 401


def test_sla_monitor_starts_and_stops_with_the_app(
    settings: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    """O monitor embutido roda em segundo plano e é cancelado no desligamento."""
    import time

    from app.core import scheduler
    from app.main import create_app

    calls: list[int] = []
    monkeypatch.setattr(scheduler, "run_sla_scan", lambda: calls.append(1) or 0)
    app = create_app(settings.model_copy(update={"SLA_MONITOR_INTERVAL_SECONDS": 1}))  # type: ignore[attr-defined]

    with TestClient(app):
        deadline = time.monotonic() + 5
        while not calls and time.monotonic() < deadline:
            time.sleep(0.05)

    assert calls, "o monitor deveria ter executado ao menos uma varredura"
