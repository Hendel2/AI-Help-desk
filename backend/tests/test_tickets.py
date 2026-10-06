"""Testes das rotas de chamados: abertura, numeração, filtros, comentários e histórico."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, Category, Company, SLAPolicy, Ticket, User
from app.models.enums import (
    AuditAction,
    RoleName,
    TicketHistoryAction,
    TicketPriority,
    TicketSource,
    TicketStatus,
)

NEW_TICKET = {
    "title": "VPN não conecta",
    "description": "Desde as 08:30 a VPN recusa minhas credenciais.",
}


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


class TestCreate:
    def test_opens_a_ticket_with_friendly_number_and_history(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        db_session.commit()

        response = client.post("/api/v1/tickets", json=NEW_TICKET, headers=auth_headers(requester))

        assert response.status_code == 201
        body = response.json()
        assert body["ticket_number"] == "HD-000001"
        assert body["status"] == "OPEN"
        assert body["priority"] == "MEDIUM"
        assert body["source"] == "WEB"
        assert body["requester"]["id"] == requester.id
        assert body["technician"] is None
        # Sem política de SLA cadastrada o chamado não tem prazo (§21).
        assert body["sla"]["status"] is None

        ticket = db_session.scalars(select(Ticket)).one()
        assert [entry.action for entry in ticket.history] == [TicketHistoryAction.CREATED]
        assert db_session.scalars(
            select(AuditLog).where(AuditLog.action == AuditAction.TICKET_CREATED)
        ).one()

    def test_numbers_are_sequential_per_company(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        make_company: Callable[..., Company],
        make_user: Callable[..., User],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        other_requester = make_user(make_company(name="Empresa Beta"), role=RoleName.USER)
        db_session.commit()

        first = client.post("/api/v1/tickets", json=NEW_TICKET, headers=auth_headers(requester))
        second = client.post("/api/v1/tickets", json=NEW_TICKET, headers=auth_headers(requester))
        other = client.post(
            "/api/v1/tickets", json=NEW_TICKET, headers=auth_headers(other_requester)
        )

        assert first.json()["ticket_number"] == "HD-000001"
        assert second.json()["ticket_number"] == "HD-000002"
        # Cada empresa tem sua própria sequência.
        assert other.json()["ticket_number"] == "HD-000001"

    def test_applies_category_default_priority_and_sla_deadlines(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        requester: User,
        make_sla_policy: Callable[..., SLAPolicy],
        make_category: Callable[..., Category],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        policy = make_sla_policy(company, response_minutes=60, resolution_minutes=480)
        category = make_category(
            company,
            name="Rede",
            default_priority=TicketPriority.HIGH,
            default_sla_policy_id=policy.id,
        )
        db_session.commit()

        response = client.post(
            "/api/v1/tickets",
            json={**NEW_TICKET, "category_id": category.id},
            headers=auth_headers(requester),
        )

        assert response.status_code == 201
        body = response.json()
        assert body["priority"] == "HIGH"
        assert body["category"]["name"] == "Rede"
        assert body["sla"]["status"] == "ON_TIME"
        assert body["sla"]["response"]["deadline"] is not None
        # 60 min de prazo, nada decorrido ainda.
        assert 3500 < body["sla"]["response"]["remaining_seconds"] <= 3600

    def test_uses_the_company_fallback_policy_for_the_priority(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        requester: User,
        make_sla_policy: Callable[..., SLAPolicy],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        make_sla_policy(
            company, priority=TicketPriority.CRITICAL, response_minutes=15, resolution_minutes=120
        )
        db_session.commit()

        response = client.post(
            "/api/v1/tickets",
            json={**NEW_TICKET, "priority": "CRITICAL"},
            headers=auth_headers(requester),
        )

        assert response.status_code == 201
        assert response.json()["sla"]["response"]["remaining_seconds"] <= 900

    def test_rejects_a_category_from_another_company(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        make_company: Callable[..., Company],
        make_category: Callable[..., Category],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        foreign = make_category(make_company(name="Empresa Beta"), name="Rede")
        db_session.commit()

        response = client.post(
            "/api/v1/tickets",
            json={**NEW_TICKET, "category_id": foreign.id},
            headers=auth_headers(requester),
        )

        assert response.status_code == 400
        assert _error(response)["code"] == "INVALID_CATEGORY"

    @pytest.mark.parametrize(
        "overrides",
        [{"title": "VPN"}, {"description": "curto"}, {"priority": "URGENTE"}],
    )
    def test_validates_the_payload(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        auth_headers: Callable[[User], dict[str, str]],
        overrides: dict[str, str],
    ) -> None:
        db_session.commit()

        response = client.post(
            "/api/v1/tickets", json={**NEW_TICKET, **overrides}, headers=auth_headers(requester)
        )

        assert response.status_code == 422

    def test_requires_authentication(self, client: TestClient) -> None:
        assert client.post("/api/v1/tickets", json=NEW_TICKET).status_code == 401


class TestList:
    def test_user_sees_only_their_own_tickets(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        requester: User,
        make_user: Callable[..., User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        other_user = make_user(company, role=RoleName.USER, name="Bruno")
        make_ticket(requester, title="Chamado da Ana")
        make_ticket(other_user, title="Chamado do Bruno")
        db_session.commit()

        response = client.get("/api/v1/tickets", headers=auth_headers(requester))

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["items"][0]["title"] == "Chamado da Ana"

    def test_technician_sees_every_ticket_of_the_company(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        requester: User,
        technician: User,
        make_user: Callable[..., User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        make_ticket(requester, title="Chamado da Ana")
        make_ticket(make_user(company, role=RoleName.USER), title="Chamado do Bruno")
        db_session.commit()

        response = client.get("/api/v1/tickets", headers=auth_headers(technician))

        assert response.json()["total"] == 2

    def test_never_shows_tickets_from_another_company(
        self,
        client: TestClient,
        db_session: Session,
        technician: User,
        make_company: Callable[..., Company],
        make_user: Callable[..., User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        foreign_user = make_user(make_company(name="Empresa Beta"), role=RoleName.USER)
        make_ticket(foreign_user, title="Chamado de outra empresa")
        db_session.commit()

        response = client.get("/api/v1/tickets", headers=auth_headers(technician))

        assert response.json() == {
            "items": [],
            "total": 0,
            "page": 1,
            "page_size": 20,
            "pages": 0,
        }

    def test_filters_by_status_priority_search_and_unassigned(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        requester: User,
        technician: User,
        make_category: Callable[..., Category],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        category = make_category(company, name="Rede")
        vpn = make_ticket(
            requester, title="VPN caiu", category=category, priority=TicketPriority.HIGH
        )
        make_ticket(requester, title="Impressora atolada", priority=TicketPriority.LOW)
        db_session.commit()
        headers = auth_headers(technician)
        client.post(f"/api/v1/tickets/{vpn.id}/assign", json={}, headers=headers)

        assert client.get("/api/v1/tickets?priority=HIGH", headers=headers).json()["total"] == 1
        assert client.get("/api/v1/tickets?search=impressora", headers=headers).json()["total"] == 1
        assert client.get("/api/v1/tickets?search=HD-0000", headers=headers).json()["total"] == 2
        assert client.get("/api/v1/tickets?unassigned=true", headers=headers).json()["total"] == 1
        assert (
            client.get(f"/api/v1/tickets?category_id={category.id}", headers=headers).json()[
                "total"
            ]
            == 1
        )
        assert (
            client.get("/api/v1/tickets?status=ASSIGNED&status=OPEN", headers=headers).json()[
                "total"
            ]
            == 2
        )
        assert client.get("/api/v1/tickets?status=RESOLVED", headers=headers).json()["total"] == 0

    def test_paginates_with_the_standard_contract(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        for index in range(3):
            make_ticket(requester, title=f"Chamado {index}")
        db_session.commit()

        response = client.get("/api/v1/tickets?page=2&page_size=2", headers=auth_headers(requester))

        body = response.json()
        assert (body["total"], body["page"], body["page_size"], body["pages"]) == (3, 2, 2, 2)
        assert len(body["items"]) == 1

    def test_mine_filter_limits_a_technician_to_their_own_tickets(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        technician: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        make_ticket(requester, title="Chamado da Ana")
        make_ticket(technician, title="Chamado do Téo")
        db_session.commit()

        response = client.get("/api/v1/tickets?mine=true", headers=auth_headers(technician))

        assert response.json()["total"] == 1
        assert response.json()["items"][0]["title"] == "Chamado do Téo"


class TestDetail:
    def test_requester_opens_their_own_ticket(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(requester)
        db_session.commit()

        response = client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_headers(requester))

        assert response.status_code == 200
        assert response.json()["description"].startswith("A VPN não conecta")

    def test_another_user_of_the_same_company_gets_404(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        requester: User,
        make_user: Callable[..., User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(requester)
        stranger = make_user(company, role=RoleName.USER, name="Bruno")
        db_session.commit()

        response = client.get(f"/api/v1/tickets/{ticket.id}", headers=auth_headers(stranger))

        # 404 (não 403): não revela que o chamado existe.
        assert response.status_code == 404
        assert _error(response)["code"] == "TICKET_NOT_FOUND"

    def test_technician_from_another_company_gets_404(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        make_company: Callable[..., Company],
        make_user: Callable[..., User],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(requester)
        foreign_technician = make_user(make_company(name="Empresa Beta"), role=RoleName.TECHNICIAN)
        db_session.commit()

        response = client.get(
            f"/api/v1/tickets/{ticket.id}", headers=auth_headers(foreign_technician)
        )

        assert response.status_code == 404


class TestComments:
    def test_internal_comment_is_hidden_from_the_requester(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        technician: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(requester)
        db_session.commit()

        client.post(
            f"/api/v1/tickets/{ticket.id}/comments",
            json={"content": "Verifiquei o servidor de autenticação.", "is_internal": True},
            headers=auth_headers(technician),
        )
        client.post(
            f"/api/v1/tickets/{ticket.id}/comments",
            json={"content": "Já estamos verificando.", "is_internal": False},
            headers=auth_headers(technician),
        )

        as_requester = client.get(
            f"/api/v1/tickets/{ticket.id}/comments", headers=auth_headers(requester)
        ).json()
        as_technician = client.get(
            f"/api/v1/tickets/{ticket.id}/comments", headers=auth_headers(technician)
        ).json()

        assert [comment["content"] for comment in as_requester] == ["Já estamos verificando."]
        assert len(as_technician) == 2

    def test_requester_cannot_create_an_internal_comment(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(requester)
        db_session.commit()

        response = client.post(
            f"/api/v1/tickets/{ticket.id}/comments",
            json={"content": "Tentando burlar", "is_internal": True},
            headers=auth_headers(requester),
        )

        assert response.status_code == 403
        assert _error(response)["code"] == "INTERNAL_COMMENT_FORBIDDEN"

    def test_first_public_staff_comment_closes_the_response_sla(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        requester: User,
        technician: User,
        make_sla_policy: Callable[..., SLAPolicy],
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        make_sla_policy(company, priority=TicketPriority.MEDIUM)
        ticket = make_ticket(requester)
        db_session.commit()

        # Comentário do próprio solicitante não conta como resposta.
        client.post(
            f"/api/v1/tickets/{ticket.id}/comments",
            json={"content": "Alguma novidade?"},
            headers=auth_headers(requester),
        )
        db_session.expire_all()
        assert db_session.get(Ticket, ticket.id).first_response_at is None  # type: ignore[union-attr]

        client.post(
            f"/api/v1/tickets/{ticket.id}/comments",
            json={"content": "Estamos analisando."},
            headers=auth_headers(technician),
        )

        db_session.expire_all()
        assert db_session.get(Ticket, ticket.id).first_response_at is not None  # type: ignore[union-attr]

    def test_closed_ticket_does_not_accept_comments(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        technician: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(requester)
        db_session.commit()
        staff = auth_headers(technician)
        assert (
            client.post(f"/api/v1/tickets/{ticket.id}/assign", json={}, headers=staff).status_code
            == 200
        )
        resolved = client.post(
            f"/api/v1/tickets/{ticket.id}/resolve",
            json={"solution": "Credenciais renovadas."},
            headers=staff,
        )
        assert resolved.status_code == 200
        assert (
            client.post(f"/api/v1/tickets/{ticket.id}/close", json={}, headers=staff).status_code
            == 200
        )

        response = client.post(
            f"/api/v1/tickets/{ticket.id}/comments",
            json={"content": "Mais uma coisa"},
            headers=auth_headers(requester),
        )

        assert response.status_code == 409
        assert _error(response)["code"] == "TICKET_CLOSED"


class TestHistory:
    def test_records_the_whole_lifecycle(
        self,
        client: TestClient,
        db_session: Session,
        requester: User,
        technician: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        ticket = make_ticket(requester)
        db_session.commit()
        staff = auth_headers(technician)

        client.post(f"/api/v1/tickets/{ticket.id}/assign", json={}, headers=staff)
        client.post(
            f"/api/v1/tickets/{ticket.id}/status", json={"status": "IN_PROGRESS"}, headers=staff
        )
        client.post(
            f"/api/v1/tickets/{ticket.id}/resolve",
            json={"solution": "Credenciais renovadas."},
            headers=staff,
        )

        history = client.get(f"/api/v1/tickets/{ticket.id}/history", headers=staff).json()
        actions = [entry["action"] for entry in history]

        assert actions[0] == "CREATED"
        assert "ASSIGNED" in actions
        assert "STATUS_CHANGED" in actions
        assert "RESOLVED" in actions
        transitions = [
            (entry["old_value"], entry["new_value"])
            for entry in history
            if entry["action"] == "STATUS_CHANGED"
        ]
        # Assumir um chamado OPEN o move para ASSIGNED automaticamente.
        assert transitions == [("OPEN", "ASSIGNED"), ("ASSIGNED", "IN_PROGRESS")]
        assert all(
            entry["user"]["name"] == "Téo Técnico"
            for entry in history
            if entry["action"] != "CREATED"
        )


def test_chatbot_tickets_are_marked_with_the_right_source(
    db_session: Session,
    requester: User,
    make_ticket: Callable[..., Ticket],
) -> None:
    """§65: chamado criado pelo chatbot recebe source=CHATBOT."""
    from app.schemas.ticket import TicketCreate
    from app.services.tickets import TicketService

    ticket = TicketService(db_session).create(
        requester,
        TicketCreate(title="VPN não conecta", description="Falha ao autenticar na VPN."),
        source=TicketSource.CHATBOT,
    )

    assert ticket.source is TicketSource.CHATBOT
    assert ticket.status is TicketStatus.OPEN
