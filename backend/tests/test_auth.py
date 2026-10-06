"""Testes das rotas de autenticação e da autorização por perfil."""

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import ForbiddenError
from app.core.security import create_token
from app.models import AuditLog, Company, User
from app.models.enums import AuditAction, RoleName
from app.services.auth import AuthService

PASSWORD = "senha-super-secreta"
REGISTER_BODY = {
    "company_name": "Empresa Teste",
    "name": "Maria Admin",
    "email": "maria@empresa.com",
    "password": PASSWORD,
}


def _error(response: Any) -> dict[str, Any]:
    return response.json()["error"]


# --- Cadastro ---------------------------------------------------------------


def test_register_creates_company_and_admin(
    client: TestClient, db_session: Session, seed_roles: dict[RoleName, Any]
) -> None:
    response = client.post("/api/v1/auth/register", json=REGISTER_BODY)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["access_token"] and body["refresh_token"]

    user = db_session.scalars(select(User).where(User.email == "maria@empresa.com")).one()
    assert user.role.name is RoleName.ADMIN
    assert user.password_hash != PASSWORD and PASSWORD not in user.password_hash
    company = db_session.get(Company, user.company_id)
    assert company is not None and company.name == "Empresa Teste"


def test_register_rejects_duplicate_email(
    client: TestClient, seed_roles: dict[RoleName, Any]
) -> None:
    assert client.post("/api/v1/auth/register", json=REGISTER_BODY).status_code == 201

    response = client.post(
        "/api/v1/auth/register", json={**REGISTER_BODY, "company_name": "Outra Empresa"}
    )

    assert response.status_code == 409
    assert _error(response)["code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_normalizes_cnpj_and_rejects_invalid_length(
    client: TestClient, db_session: Session, seed_roles: dict[RoleName, Any]
) -> None:
    ok = client.post("/api/v1/auth/register", json={**REGISTER_BODY, "cnpj": "12.345.678/0001-95"})
    assert ok.status_code == 201
    user = db_session.scalars(select(User).where(User.email == "maria@empresa.com")).one()
    assert db_session.get(Company, user.company_id).cnpj == "12345678000195"  # type: ignore[union-attr]

    invalid = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_BODY, "email": "outro@empresa.com", "cnpj": "123"},
    )
    assert invalid.status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [
        {"password": "curta"},
        {"email": "não-é-email"},
        {"name": "A"},
        {"company_name": ""},
    ],
)
def test_register_validates_payload(
    client: TestClient, seed_roles: dict[RoleName, Any], overrides: dict[str, str]
) -> None:
    response = client.post("/api/v1/auth/register", json={**REGISTER_BODY, **overrides})

    assert response.status_code == 422
    assert _error(response)["code"] == "VALIDATION_ERROR"
    # A senha enviada nunca pode aparecer na resposta de erro.
    assert PASSWORD not in response.text


# --- Login ------------------------------------------------------------------


def test_login_succeeds_and_records_audit(
    client: TestClient,
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
) -> None:
    company = make_company()
    user = make_user(company, email="joao@empresa.com", password=PASSWORD)
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login", json={"email": "JOAO@empresa.com", "password": PASSWORD}
    )

    assert response.status_code == 200
    assert response.json()["access_token"]
    log = db_session.scalars(
        select(AuditLog).where(AuditLog.action == AuditAction.LOGIN_SUCCEEDED)
    ).one()
    assert log.user_id == user.id and log.company_id == company.id


@pytest.mark.parametrize(
    ("email", "password"),
    [("joao@empresa.com", "senha-errada"), ("ninguem@empresa.com", PASSWORD)],
)
def test_login_failure_is_generic_and_audited(
    client: TestClient,
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
    email: str,
    password: str,
) -> None:
    make_user(make_company(), email="joao@empresa.com", password=PASSWORD)
    db_session.commit()

    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})

    assert response.status_code == 401
    error = _error(response)
    # Mesma resposta para senha errada e e-mail inexistente (não enumera contas).
    assert error["code"] == "INVALID_CREDENTIALS"
    assert error["message"] == "E-mail ou senha inválidos."
    assert db_session.scalars(
        select(AuditLog).where(AuditLog.action == AuditAction.LOGIN_FAILED)
    ).first()


def test_login_with_short_password_returns_401_not_422(
    client: TestClient,
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
) -> None:
    """A rota de login não aplica a política de senha (não revela a regra)."""
    make_user(make_company(), email="joao@empresa.com", password=PASSWORD)
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login", json={"email": "joao@empresa.com", "password": "curta"}
    )

    assert response.status_code == 401
    assert _error(response)["code"] == "INVALID_CREDENTIALS"


def test_login_rejects_inactive_account(
    client: TestClient,
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
) -> None:
    make_user(make_company(), email="inativo@empresa.com", password=PASSWORD, is_active=False)
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login", json={"email": "inativo@empresa.com", "password": PASSWORD}
    )

    assert response.status_code == 403
    assert _error(response)["code"] == "ACCOUNT_INACTIVE"


# --- /auth/me ---------------------------------------------------------------


def test_me_returns_authenticated_user_without_password(
    client: TestClient,
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    user = make_user(make_company(), role=RoleName.TECHNICIAN, password=PASSWORD)
    db_session.commit()

    response = client.get("/api/v1/auth/me", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user.id
    assert body["company_id"] == user.company_id
    assert body["role"] == "TECHNICIAN"
    assert "password_hash" not in body and "password" not in body


def test_me_requires_token(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert _error(response)["code"] == "NOT_AUTHENTICATED"


@pytest.mark.parametrize("token", ["lixo", "a.b.c", ""])
def test_me_rejects_invalid_token(client: TestClient, token: str) -> None:
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert _error(response)["code"] in {"INVALID_TOKEN", "NOT_AUTHENTICATED"}


def test_token_from_another_company_is_rejected(
    client: TestClient,
    db_session: Session,
    settings: Settings,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
) -> None:
    """Token com company_id de outra empresa não acessa o usuário (multiempresa)."""
    user = make_user(make_company(), password=PASSWORD)
    other_company = make_company()
    db_session.commit()

    forged = create_token(
        user_id=user.id,
        company_id=other_company.id,
        role=RoleName.ADMIN.value,
        token_type="access",
        expires_in=timedelta(minutes=5),
        secret=settings.JWT_SECRET.get_secret_value(),
    )

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})

    assert response.status_code == 401
    assert _error(response)["code"] == "INVALID_TOKEN"


def test_deactivated_user_cannot_use_existing_token(
    client: TestClient,
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    user = make_user(make_company(), password=PASSWORD)
    db_session.commit()
    headers = auth_headers(user)
    user.is_active = False
    db_session.commit()

    response = client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 403
    assert _error(response)["code"] == "ACCOUNT_INACTIVE"


# --- Refresh ----------------------------------------------------------------


def test_refresh_returns_new_tokens(
    client: TestClient,
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
) -> None:
    make_user(make_company(), email="joao@empresa.com", password=PASSWORD)
    db_session.commit()
    tokens = client.post(
        "/api/v1/auth/login", json={"email": "joao@empresa.com", "password": PASSWORD}
    ).json()

    response = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})

    assert response.status_code == 200
    assert response.json()["access_token"]
    # O access token não serve como refresh token.
    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert reused.status_code == 401
    assert _error(reused)["code"] == "INVALID_TOKEN"


# --- Autorização por perfil -------------------------------------------------


@pytest.mark.parametrize(
    ("role", "allowed"),
    [(RoleName.ADMIN, True), (RoleName.TECHNICIAN, False), (RoleName.USER, False)],
)
def test_require_roles_allows_only_listed_roles(
    db_session: Session,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
    role: RoleName,
    allowed: bool,
) -> None:
    from app.api.deps import require_roles

    user = make_user(make_company(), role=role)
    db_session.commit()
    dependency = require_roles(RoleName.ADMIN)

    if allowed:
        assert dependency(user) is user  # type: ignore[call-arg]
    else:
        with pytest.raises(ForbiddenError):
            dependency(user)  # type: ignore[call-arg]


def test_register_fails_clearly_without_seeded_roles(
    client: TestClient, db_session: Session
) -> None:
    """Sem os perfis da migration o cadastro falha sem vazar detalhes internos."""
    response = client.post("/api/v1/auth/register", json=REGISTER_BODY)

    assert response.status_code == 400
    assert _error(response)["code"] == "ROLES_NOT_INITIALIZED"
    assert db_session.scalars(select(User)).first() is None


def test_auth_service_requires_company_scope_for_user_lookup(
    db_session: Session,
    settings: Settings,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
) -> None:
    """O repositório de usuários nunca resolve um usuário fora da empresa do token."""
    user = make_user(make_company(), password=PASSWORD)
    other = make_company()
    db_session.commit()
    service = AuthService(db_session, settings)

    assert service.users.get_with_role(user.company_id, user.id) is not None
    assert service.users.get_with_role(other.id, user.id) is None
