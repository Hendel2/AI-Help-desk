"""Administração (§32, §50): usuários, departamentos, categorias, SLA, empresa e auditoria."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, Company, Ticket, User
from app.models.enums import AuditAction, RoleName

Headers = Callable[[User], dict[str, str]]


@pytest.fixture
def company(make_company: Callable[..., Company]) -> Company:
    return make_company(name="Empresa Alfa")


@pytest.fixture
def people(
    company: Company,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
    db_session: Session,
) -> dict[str, User]:
    other = make_company(name="Empresa Beta")
    users = {
        "alice": make_user(company, role=RoleName.ADMIN, name="Alice Admin"),
        "tom": make_user(company, role=RoleName.TECHNICIAN, name="Tom Técnico"),
        "ana": make_user(company, role=RoleName.USER, name="Ana Usuária"),
        "outsider": make_user(other, role=RoleName.ADMIN, name="Zé de Fora"),
    }
    db_session.commit()
    return users


@pytest.fixture
def admin(people: dict[str, User], auth_headers: Headers) -> dict[str, str]:
    return auth_headers(people["alice"])


def _error(response: Any) -> str:
    return response.json()["error"]["code"]


# --- Usuários -------------------------------------------------------------------


def test_only_admin_reaches_admin_endpoints(
    client: TestClient, people: dict[str, User], auth_headers: Headers
) -> None:
    for path in ["/users", "/departments", "/sla-policies", "/company", "/audit-logs"]:
        response = client.get(f"/api/v1{path}", headers=auth_headers(people["tom"]))
        assert response.status_code == 403, path


def test_list_users_is_scoped_and_filterable(
    client: TestClient, people: dict[str, User], admin: dict[str, str]
) -> None:
    body = client.get("/api/v1/users", headers=admin).json()
    assert body["total"] == 3
    assert "Zé de Fora" not in [u["name"] for u in body["items"]]

    body = client.get("/api/v1/users", params={"role": "TECHNICIAN"}, headers=admin).json()
    assert [u["name"] for u in body["items"]] == ["Tom Técnico"]

    body = client.get("/api/v1/users", params={"q": "ANA"}, headers=admin).json()
    assert [u["email"] for u in body["items"]] == [people["ana"].email]


def test_other_company_user_is_not_found(
    client: TestClient, people: dict[str, User], admin: dict[str, str]
) -> None:
    response = client.get(f"/api/v1/users/{people['outsider'].id}", headers=admin)
    assert response.status_code == 404


def test_create_user_can_log_in_and_is_audited(
    client: TestClient, people: dict[str, User], admin: dict[str, str], db_session: Session
) -> None:
    department = client.post("/api/v1/departments", json={"name": "Financeiro"}, headers=admin)
    payload = {
        "name": "Bia Nova",
        "email": "Bia@Empresa.com",
        "password": "senha-forte-1",
        "role": "TECHNICIAN",
        "department_id": department.json()["id"],
    }

    response = client.post("/api/v1/users", json=payload, headers=admin)

    assert response.status_code == 201, response.text
    created = response.json()
    assert created["email"] == "bia@empresa.com"
    assert created["role"] == "TECHNICIAN"
    assert created["department"]["name"] == "Financeiro"
    login = client.post(
        "/api/v1/auth/login", json={"email": "bia@empresa.com", "password": "senha-forte-1"}
    )
    assert login.status_code == 200
    duplicate = client.post("/api/v1/users", json=payload, headers=admin)
    assert (duplicate.status_code, _error(duplicate)) == (409, "EMAIL_IN_USE")
    entry = db_session.scalars(
        select(AuditLog).where(AuditLog.action == AuditAction.USER_CREATED)
    ).one()
    assert "senha" not in str(entry.metadata_)


def test_department_from_other_company_is_rejected(
    client: TestClient,
    people: dict[str, User],
    admin: dict[str, str],
    auth_headers: Headers,
) -> None:
    foreign = client.post(
        "/api/v1/departments", json={"name": "RH"}, headers=auth_headers(people["outsider"])
    ).json()

    response = client.put(
        f"/api/v1/users/{people['ana'].id}", json={"department_id": foreign["id"]}, headers=admin
    )

    assert (response.status_code, _error(response)) == (400, "DEPARTMENT_INVALID")


def test_role_change_is_audited_as_permission_change(
    client: TestClient, people: dict[str, User], admin: dict[str, str], db_session: Session
) -> None:
    response = client.put(
        f"/api/v1/users/{people['ana'].id}", json={"role": "TECHNICIAN"}, headers=admin
    )

    assert response.json()["role"] == "TECHNICIAN"
    entry = db_session.scalars(
        select(AuditLog).where(AuditLog.action == AuditAction.PERMISSION_CHANGED)
    ).one()
    assert entry.metadata_ == {"from": "USER", "to": "TECHNICIAN"}


def test_admin_cannot_lock_themself_out(
    client: TestClient, people: dict[str, User], admin: dict[str, str]
) -> None:
    alice = people["alice"].id
    for payload in ({"role": "USER"}, {"is_active": False}):
        response = client.put(f"/api/v1/users/{alice}", json=payload, headers=admin)
        assert (response.status_code, _error(response)) == (400, "SELF_LOCKOUT")
    response = client.delete(f"/api/v1/users/{alice}", headers=admin)
    assert response.status_code == 400


def test_company_keeps_at_least_one_active_admin(
    client: TestClient,
    company: Company,
    make_user: Callable[..., User],
    people: dict[str, User],
    auth_headers: Headers,
    db_session: Session,
) -> None:
    bob = make_user(company, role=RoleName.ADMIN, name="Bob Admin")
    db_session.commit()
    bob_headers = auth_headers(bob)

    assert (
        client.delete(f"/api/v1/users/{people['alice'].id}", headers=bob_headers).status_code == 204
    )
    # Alice desativada: Bob é o último admin e não pode ser rebaixado por ninguém.
    response = client.put(
        f"/api/v1/users/{bob.id}", json={"role": "TECHNICIAN"}, headers=bob_headers
    )
    assert _error(response) == "SELF_LOCKOUT"


def test_deactivated_user_cannot_log_in_and_tokens_stop_working(
    client: TestClient, people: dict[str, User], admin: dict[str, str], auth_headers: Headers
) -> None:
    ana_headers = auth_headers(people["ana"])

    assert client.delete(f"/api/v1/users/{people['ana'].id}", headers=admin).status_code == 204

    assert client.get("/api/v1/auth/me", headers=ana_headers).status_code == 403
    listed = client.get("/api/v1/users", params={"is_active": False}, headers=admin).json()
    assert [u["name"] for u in listed["items"]] == ["Ana Usuária"]


def test_technicians_list_for_staff(
    client: TestClient, people: dict[str, User], auth_headers: Headers
) -> None:
    response = client.get("/api/v1/users/technicians", headers=auth_headers(people["tom"]))
    assert [t["name"] for t in response.json()] == ["Alice Admin", "Tom Técnico"]
    assert (
        client.get("/api/v1/users/technicians", headers=auth_headers(people["ana"])).status_code
        == 403
    )


# --- Departamentos, categorias e SLA ----------------------------------------------


def test_department_crud_and_user_count(
    client: TestClient, people: dict[str, User], admin: dict[str, str]
) -> None:
    created = client.post(
        "/api/v1/departments", json={"name": "TI", "description": " "}, headers=admin
    ).json()
    assert created["description"] is None
    client.put(
        f"/api/v1/users/{people['ana'].id}", json={"department_id": created["id"]}, headers=admin
    )
    duplicate = client.post("/api/v1/departments", json={"name": "ti"}, headers=admin)
    assert (duplicate.status_code, _error(duplicate)) == (409, "NAME_IN_USE")

    listed = client.get("/api/v1/departments", headers=admin).json()
    assert listed == [{"id": created["id"], "name": "TI", "description": None, "user_count": 1}]

    assert client.delete(f"/api/v1/departments/{created['id']}", headers=admin).status_code == 204
    user = client.get(f"/api/v1/users/{people['ana'].id}", headers=admin).json()
    assert user["department"] is None


def test_sla_policy_validation_and_in_use_protection(
    client: TestClient, people: dict[str, User], admin: dict[str, str]
) -> None:
    invalid = client.post(
        "/api/v1/sla-policies",
        json={"name": "Rápido", "response_time_minutes": 60, "resolution_time_minutes": 30},
        headers=admin,
    )
    assert invalid.status_code == 422

    policy = client.post(
        "/api/v1/sla-policies",
        json={"name": "Padrão", "response_time_minutes": 60, "resolution_time_minutes": 480},
        headers=admin,
    ).json()
    category = client.post(
        "/api/v1/categories",
        json={"name": "VPN", "default_priority": "HIGH", "default_sla_policy_id": policy["id"]},
        headers=admin,
    )
    assert category.status_code == 201

    response = client.delete(f"/api/v1/sla-policies/{policy['id']}", headers=admin)
    assert (response.status_code, _error(response)) == (409, "SLA_POLICY_IN_USE")


def test_category_crud_inactive_and_in_use(
    client: TestClient,
    people: dict[str, User],
    admin: dict[str, str],
    make_ticket: Callable[..., Ticket],
    db_session: Session,
    auth_headers: Headers,
) -> None:
    unused = client.post("/api/v1/categories", json={"name": "Teste"}, headers=admin).json()
    assert client.delete(f"/api/v1/categories/{unused['id']}", headers=admin).status_code == 204

    used = client.post("/api/v1/categories", json={"name": "Rede"}, headers=admin).json()
    ticket = make_ticket(people["ana"])
    ticket.category_id = used["id"]
    db_session.commit()
    response = client.delete(f"/api/v1/categories/{used['id']}", headers=admin)
    assert (response.status_code, _error(response)) == (409, "CATEGORY_IN_USE")

    client.put(
        f"/api/v1/categories/{used['id']}", json={"name": "Rede", "is_active": False}, headers=admin
    )
    public = client.get("/api/v1/categories", headers=auth_headers(people["ana"])).json()
    assert "Rede" not in [c["name"] for c in public]
    managed = client.get("/api/v1/categories/manage", headers=admin).json()
    assert [(c["name"], c["is_active"]) for c in managed] == [("Rede", False)]


def test_category_rejects_sla_policy_from_other_company(
    client: TestClient, people: dict[str, User], admin: dict[str, str], auth_headers: Headers
) -> None:
    foreign = client.post(
        "/api/v1/sla-policies",
        json={"name": "Deles", "response_time_minutes": 10, "resolution_time_minutes": 20},
        headers=auth_headers(people["outsider"]),
    ).json()

    response = client.post(
        "/api/v1/categories",
        json={"name": "VPN", "default_sla_policy_id": foreign["id"]},
        headers=admin,
    )

    assert (response.status_code, _error(response)) == (400, "SLA_POLICY_INVALID")


# --- Empresa, auditoria e IA -----------------------------------------------------------


def test_update_company(client: TestClient, people: dict[str, User], admin: dict[str, str]) -> None:
    response = client.put(
        "/api/v1/company",
        json={
            "name": "Alfa Ltda",
            "cnpj": "12.345.678/0001-90",
            "email": "",
            "phone": "1133334444",
        },
        headers=admin,
    )

    assert response.status_code == 200, response.text
    assert response.json()["cnpj"] == "12345678000190"
    assert response.json()["email"] is None


def test_audit_log_lists_company_events_newest_first(
    client: TestClient, people: dict[str, User], admin: dict[str, str], auth_headers: Headers
) -> None:
    client.post("/api/v1/departments", json={"name": "RH"}, headers=admin)
    client.put(f"/api/v1/users/{people['ana'].id}", json={"role": "TECHNICIAN"}, headers=admin)
    client.post(
        "/api/v1/departments", json={"name": "Fora"}, headers=auth_headers(people["outsider"])
    )

    body = client.get("/api/v1/audit-logs", headers=admin).json()

    assert [i["action"] for i in body["items"]] == ["PERMISSION_CHANGED", "SETTINGS_CHANGED"]
    assert body["items"][0]["user"]["name"] == "Alice Admin"
    filtered = client.get(
        "/api/v1/audit-logs", params={"entity": "department"}, headers=admin
    ).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["metadata"] == {"operation": "create"}


def test_ai_settings_read_only(
    client: TestClient, people: dict[str, User], admin: dict[str, str]
) -> None:
    body = client.get("/api/v1/ai/settings", headers=admin).json()

    assert body == {
        "provider": "none",
        "model": None,
        "generative_enabled": False,
        "vector_store": "memory",
        "actions_last_30_days": 0,
        "success_rate": None,
        "positive_feedback_rate": None,
    }
