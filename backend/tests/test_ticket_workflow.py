"""Fluxo de status (§15) e permissões por perfil (§7) dos chamados."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Company, SLAPolicy, Ticket, User
from app.models.enums import RoleName, TicketPriority, TicketStatus
from app.services.tickets import ALLOWED_TRANSITIONS


def _error(response: Any) -> dict[str, Any]:
    return response.json()["error"]


@pytest.fixture
def company(make_company: Callable[..., Company]) -> Company:
    return make_company(name="Empresa Alfa")


@pytest.fixture
def requester(company: Company, make_user: Callable[..., User], db_session: Session) -> User:
    # Commit: as requisições do TestClient compartilham a conexão (StaticPool) e
    # o rollback ao fim de cada request apagaria um usuário apenas "flushed".
    user = make_user(company, role=RoleName.USER, name="Ana Solicitante")
    db_session.commit()
    return user


@pytest.fixture
def technician(company: Company, make_user: Callable[..., User], db_session: Session) -> User:
    # Commit: as requisições do TestClient compartilham a conexão (StaticPool) e
    # o rollback ao fim de cada request apagaria um usuário apenas "flushed".
    user = make_user(company, role=RoleName.TECHNICIAN, name="Téo Técnico")
    db_session.commit()
    return user


@pytest.fixture
def admin(company: Company, make_user: Callable[..., User], db_session: Session) -> User:
    # Commit: as requisições do TestClient compartilham a conexão (StaticPool) e
    # o rollback ao fim de cada request apagaria um usuário apenas "flushed".
    user = make_user(company, role=RoleName.ADMIN, name="Alice Admin")
    db_session.commit()
    return user


@pytest.fixture
def ticket(requester: User, make_ticket: Callable[..., Ticket], db_session: Session) -> Ticket:
    created = make_ticket(requester)
    db_session.commit()
    return created


def post_status(
    client: TestClient, ticket: Ticket, headers: dict[str, str], status: str, **extra: Any
) -> Any:
    return client.post(
        f"/api/v1/tickets/{ticket.id}/status", json={"status": status, **extra}, headers=headers
    )


class TestTransitions:
    def test_closed_and_cancelled_are_terminal(self) -> None:
        assert ALLOWED_TRANSITIONS[TicketStatus.CLOSED] == frozenset()
        assert ALLOWED_TRANSITIONS[TicketStatus.CANCELLED] == frozenset()

    def test_every_status_has_a_rule(self) -> None:
        assert set(ALLOWED_TRANSITIONS) == set(TicketStatus)

    def test_full_happy_path(
        self,
        client: TestClient,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(technician)

        assert post_status(client, ticket, headers, "TRIAGE").json()["status"] == "TRIAGE"
        assigned = client.post(f"/api/v1/tickets/{ticket.id}/assign", json={}, headers=headers)
        assert assigned.json()["status"] == "ASSIGNED"
        assert assigned.json()["technician"]["name"] == "Téo Técnico"
        assert post_status(client, ticket, headers, "IN_PROGRESS").json()["status"] == "IN_PROGRESS"
        assert (
            post_status(client, ticket, headers, "WAITING_USER").json()["status"] == "WAITING_USER"
        )
        assert post_status(client, ticket, headers, "IN_PROGRESS").json()["status"] == "IN_PROGRESS"
        resolved = client.post(
            f"/api/v1/tickets/{ticket.id}/resolve",
            json={"solution": "Cliente VPN atualizado."},
            headers=headers,
        ).json()
        assert resolved["status"] == "RESOLVED"
        assert resolved["resolved_at"] is not None
        closed = client.post(f"/api/v1/tickets/{ticket.id}/close", json={}, headers=headers).json()
        assert closed["status"] == "CLOSED"
        assert closed["closed_at"] is not None
        assert closed["allowed_transitions"] == []

    @pytest.mark.parametrize("target", ["RESOLVED", "WAITING_USER", "CLOSED"])
    def test_invalid_transition_from_open_is_rejected(
        self,
        client: TestClient,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
        target: str,
    ) -> None:
        response = post_status(
            client, ticket, auth_headers(technician), target, comment="Solução aplicada."
        )

        assert response.status_code == 409
        assert _error(response)["code"] == "INVALID_STATUS_TRANSITION"

    def test_invalid_transition_has_no_side_effects(
        self,
        client: TestClient,
        db_session: Session,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        """Uma transição recusada não pode deixar o técnico atribuído."""
        post_status(client, ticket, auth_headers(technician), "CLOSED")

        db_session.expire_all()
        reloaded = db_session.get(Ticket, ticket.id)
        assert reloaded is not None
        assert reloaded.technician_id is None
        assert reloaded.status is TicketStatus.OPEN

    def test_same_status_is_rejected(
        self,
        client: TestClient,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(technician)
        post_status(client, ticket, headers, "TRIAGE")

        response = post_status(client, ticket, headers, "TRIAGE")

        assert response.status_code == 409
        assert _error(response)["code"] == "TICKET_STATUS_UNCHANGED"

    def test_starting_work_assigns_the_ticket_to_the_technician(
        self,
        client: TestClient,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        response = post_status(client, ticket, auth_headers(technician), "IN_PROGRESS")

        assert response.status_code == 200
        assert response.json()["technician"]["id"] == technician.id

    def test_resolution_requires_a_solution(
        self,
        client: TestClient,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(technician)
        post_status(client, ticket, headers, "IN_PROGRESS")

        response = post_status(client, ticket, headers, "RESOLVED")

        assert response.status_code == 400
        assert _error(response)["code"] == "SOLUTION_REQUIRED"

    def test_resolved_ticket_can_be_reopened(
        self,
        client: TestClient,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(technician)
        post_status(client, ticket, headers, "IN_PROGRESS")
        client.post(
            f"/api/v1/tickets/{ticket.id}/resolve", json={"solution": "Feito."}, headers=headers
        )

        reopened = post_status(client, ticket, headers, "IN_PROGRESS").json()
        history = client.get(f"/api/v1/tickets/{ticket.id}/history", headers=headers).json()

        assert reopened["status"] == "IN_PROGRESS"
        assert reopened["resolved_at"] is None
        assert history[-1]["action"] == "REOPENED"

    def test_closed_ticket_cannot_be_changed(
        self,
        client: TestClient,
        ticket: Ticket,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(technician)
        post_status(client, ticket, headers, "CANCELLED")

        update = client.put(
            f"/api/v1/tickets/{ticket.id}", json={"priority": "HIGH"}, headers=headers
        )
        assign = client.post(f"/api/v1/tickets/{ticket.id}/assign", json={}, headers=headers)

        assert update.status_code == 409
        assert assign.status_code == 409
        assert _error(update)["code"] == "TICKET_CLOSED"


class TestPermissions:
    def test_user_cannot_change_status(
        self,
        client: TestClient,
        ticket: Ticket,
        requester: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        response = post_status(client, ticket, auth_headers(requester), "CANCELLED")

        assert response.status_code == 403
        assert _error(response)["code"] == "STATUS_CHANGE_FORBIDDEN"

    def test_user_cannot_assign(
        self,
        client: TestClient,
        ticket: Ticket,
        requester: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        response = client.post(
            f"/api/v1/tickets/{ticket.id}/assign", json={}, headers=auth_headers(requester)
        )

        assert response.status_code == 403

    def test_technician_cannot_assign_to_someone_else(
        self,
        client: TestClient,
        company: Company,
        ticket: Ticket,
        technician: User,
        make_user: Callable[..., User],
        auth_headers: Callable[[User], dict[str, str]],
        db_session: Session,
    ) -> None:
        colleague = make_user(company, role=RoleName.TECHNICIAN)
        db_session.commit()

        response = client.post(
            f"/api/v1/tickets/{ticket.id}/assign",
            json={"technician_id": colleague.id},
            headers=auth_headers(technician),
        )

        assert response.status_code == 403
        assert _error(response)["code"] == "ASSIGN_FORBIDDEN"

    def test_admin_assigns_to_a_technician(
        self,
        client: TestClient,
        ticket: Ticket,
        admin: User,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        response = client.post(
            f"/api/v1/tickets/{ticket.id}/assign",
            json={"technician_id": technician.id},
            headers=auth_headers(admin),
        )

        assert response.status_code == 200
        assert response.json()["technician"]["id"] == technician.id

    def test_admin_cannot_assign_to_a_regular_user_or_another_company(
        self,
        client: TestClient,
        ticket: Ticket,
        admin: User,
        requester: User,
        make_company: Callable[..., Company],
        make_user: Callable[..., User],
        auth_headers: Callable[[User], dict[str, str]],
        db_session: Session,
    ) -> None:
        foreign_technician = make_user(make_company(name="Beta"), role=RoleName.TECHNICIAN)
        db_session.commit()
        headers = auth_headers(admin)

        to_user = client.post(
            f"/api/v1/tickets/{ticket.id}/assign",
            json={"technician_id": requester.id},
            headers=headers,
        )
        to_foreign = client.post(
            f"/api/v1/tickets/{ticket.id}/assign",
            json={"technician_id": foreign_technician.id},
            headers=headers,
        )

        assert to_user.status_code == 400
        assert to_foreign.status_code == 400
        assert _error(to_foreign)["code"] == "INVALID_TECHNICIAN"

    def test_requester_edits_text_only_while_ticket_is_open(
        self,
        client: TestClient,
        ticket: Ticket,
        requester: User,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(requester)

        edited = client.put(
            f"/api/v1/tickets/{ticket.id}",
            json={"description": "Atualizando: o erro é 'credenciais inválidas'."},
            headers=headers,
        )
        priority = client.put(
            f"/api/v1/tickets/{ticket.id}", json={"priority": "CRITICAL"}, headers=headers
        )
        client.post(
            f"/api/v1/tickets/{ticket.id}/assign", json={}, headers=auth_headers(technician)
        )
        after_assignment = client.put(
            f"/api/v1/tickets/{ticket.id}",
            json={"title": "Novo título do chamado"},
            headers=headers,
        )

        assert edited.status_code == 200
        assert priority.status_code == 403
        assert _error(priority)["code"] == "TICKET_FIELD_FORBIDDEN"
        assert after_assignment.status_code == 403
        assert _error(after_assignment)["code"] == "TICKET_NOT_EDITABLE"

    def test_requester_closes_their_own_resolved_ticket(
        self,
        client: TestClient,
        ticket: Ticket,
        requester: User,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        staff = auth_headers(technician)
        post_status(client, ticket, staff, "IN_PROGRESS")
        resolved = client.post(
            f"/api/v1/tickets/{ticket.id}/resolve", json={"solution": "Feito."}, headers=staff
        )
        assert resolved.status_code == 200

        as_requester = client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_headers(requester))
        assert as_requester.json()["allowed_transitions"] == ["CLOSED"]

        closed = client.post(
            f"/api/v1/tickets/{ticket.id}/close", json={}, headers=auth_headers(requester)
        )
        assert closed.status_code == 200
        assert closed.json()["status"] == "CLOSED"

    def test_allowed_transitions_reflect_the_role(
        self,
        client: TestClient,
        ticket: Ticket,
        requester: User,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        as_user = client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_headers(requester))
        as_staff = client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_headers(technician))

        assert as_user.json()["allowed_transitions"] == []
        assert as_staff.json()["allowed_transitions"] == [
            "TRIAGE",
            "ASSIGNED",
            "IN_PROGRESS",
            "CANCELLED",
        ]


class TestSLARecalculation:
    def test_changing_priority_recalculates_the_deadlines(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        ticket: Ticket,
        technician: User,
        make_sla_policy: Callable[..., SLAPolicy],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        make_sla_policy(
            company, priority=TicketPriority.CRITICAL, response_minutes=15, resolution_minutes=120
        )
        db_session.commit()

        response = client.put(
            f"/api/v1/tickets/{ticket.id}",
            json={"priority": "CRITICAL"},
            headers=auth_headers(technician),
        )

        body = response.json()
        assert response.status_code == 200
        assert body["priority"] == "CRITICAL"
        assert body["sla"]["status"] == "ON_TIME"
        assert body["sla"]["response"]["remaining_seconds"] <= 15 * 60
        history = client.get(
            f"/api/v1/tickets/{ticket.id}/history", headers=auth_headers(technician)
        ).json()
        change = next(entry for entry in history if entry["action"] == "PRIORITY_CHANGED")
        assert (change["old_value"], change["new_value"]) == ("MEDIUM", "CRITICAL")
