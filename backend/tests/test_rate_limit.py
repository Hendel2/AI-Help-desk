"""Segurança da API (§60): limite de requisições e cabeçalhos de segurança."""

from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import Settings
from app.core.exceptions import TooManyRequestsError
from app.core.rate_limit import AI, LOGIN, RateLimiter, Rule
from app.models import Company, User
from app.models.enums import RoleName
from app.services.auth import AuthService


@pytest.fixture
def user(make_company: Callable[..., Company], make_user: Callable[..., User], db_session) -> User:  # type: ignore[no-untyped-def]
    created = make_user(
        make_company(name="Alfa"), role=RoleName.USER, name="Ana", password="password123"
    )
    db_session.commit()
    return created


def test_window_slides_and_releases_after_expiry() -> None:
    now = [1000.0]
    limiter = RateLimiter(clock=lambda: now[0])
    rule = Rule("test", limit=2, window_seconds=60)

    limiter.check(rule, "k")
    now[0] += 30
    limiter.check(rule, "k")
    with pytest.raises(TooManyRequestsError) as error:
        limiter.check(rule, "k")
    assert error.value.headers == {"Retry-After": "30"}

    now[0] += 31  # a primeira tentativa saiu da janela
    limiter.check(rule, "k")
    limiter.check(rule, "other")  # chaves independentes


def test_disabled_limiter_never_blocks() -> None:
    limiter = RateLimiter(enabled=False)
    for _ in range(LOGIN.limit * 3):
        limiter.check(LOGIN, "k")


def test_login_is_limited_per_ip_and_account(client: TestClient, user: User) -> None:
    attempt = {"email": user.email, "password": "senha-errada"}
    for _ in range(LOGIN.limit):
        assert client.post("/api/v1/auth/login", json=attempt).status_code == 401

    blocked = client.post("/api/v1/auth/login", json=attempt)

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    assert int(blocked.headers["Retry-After"]) > 0
    # Outra conta a partir do mesmo IP continua podendo tentar.
    other = client.post("/api/v1/auth/login", json={"email": "outra@empresa.com", "password": "x"})
    assert other.status_code == 401


def test_ai_routes_are_limited_per_user(
    client: TestClient, user: User, auth_headers: Callable[[User], dict[str, str]]
) -> None:
    headers = auth_headers(user)
    payload = {"text": "Minha VPN não conecta desde cedo"}
    for _ in range(AI.limit):
        assert client.post("/api/v1/ai/classify", json=payload, headers=headers).status_code == 200

    assert client.post("/api/v1/ai/classify", json=payload, headers=headers).status_code == 429


def test_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in response.headers["Content-Security-Policy"]
    assert "Strict-Transport-Security" not in response.headers  # só em produção

    auth = client.post("/api/v1/auth/login", json={"email": "x@y.com", "password": "z"})
    assert auth.headers["Cache-Control"] == "no-store"


def _old_session(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    db_session: Session,
    user: User,
) -> dict[str, str]:
    """Tokens emitidos 10 s atrás (antes de qualquer troca de senha no teste)."""
    real_now = security.utcnow()
    monkeypatch.setattr(security, "utcnow", lambda: real_now - timedelta(seconds=10))
    tokens = AuthService(db_session, settings).issue_tokens(user)
    monkeypatch.undo()
    return {
        "Authorization": f"Bearer {tokens.access_token}",
        "refresh": tokens.refresh_token,
    }


def test_change_password_requires_current_and_ends_other_sessions(
    client: TestClient,
    user: User,
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    db_session: Session,
) -> None:
    old = _old_session(monkeypatch, settings, db_session, user)
    headers = {"Authorization": old["Authorization"]}
    url = "/api/v1/auth/change-password"

    wrong = client.post(
        url, json={"current_password": "errada", "new_password": "nova-senha-1"}, headers=headers
    )
    assert (wrong.status_code, wrong.json()["error"]["code"]) == (400, "INVALID_PASSWORD")

    ok = client.post(
        url,
        json={"current_password": "password123", "new_password": "nova-senha-1"},
        headers=headers,
    )
    assert ok.status_code == 200
    fresh = {"Authorization": f"Bearer {ok.json()['access_token']}"}

    # A sessão que trocou a senha segue com os tokens novos; os antigos caem.
    assert client.get("/api/v1/auth/me", headers=fresh).status_code == 200
    stale = client.get("/api/v1/auth/me", headers=headers)
    assert (stale.status_code, stale.json()["error"]["code"]) == (401, "INVALID_TOKEN")
    refresh = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh"]})
    assert refresh.status_code == 401
    login = client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "nova-senha-1"}
    )
    assert login.status_code == 200


def test_admin_password_reset_ends_user_sessions(
    client: TestClient,
    user: User,
    make_user: Callable[..., User],
    auth_headers: Callable[[User], dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    db_session: Session,
) -> None:
    admin = make_user(user.company, role=RoleName.ADMIN, name="Alice")
    db_session.commit()
    old = _old_session(monkeypatch, settings, db_session, user)

    reset = client.put(
        f"/api/v1/users/{user.id}",
        json={"password": "redefinida-1"},
        headers=auth_headers(admin),
    )

    assert reset.status_code == 200
    stale = client.get("/api/v1/auth/me", headers={"Authorization": old["Authorization"]})
    assert stale.status_code == 401
