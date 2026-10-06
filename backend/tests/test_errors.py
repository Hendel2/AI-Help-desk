"""Formato padrão de erros, request id e logs de acesso."""

import json
import logging
import re
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.core.exceptions import (
    INTERNAL_ERROR_MESSAGE,
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from app.core.logging import JsonFormatter, request_id_var

SECRET_INPUT = "super-secret-password-123"


class _Payload(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=50)


@pytest.fixture
def error_app(app: FastAPI) -> FastAPI:
    @app.get("/test/boom")
    def boom() -> None:
        raise RuntimeError("database password=hunter2 leaked in exception")

    @app.post("/test/payload")
    def payload(body: _Payload) -> dict[str, str]:
        return {"email": body.email}

    @app.get("/test/not-found")
    def not_found() -> None:
        raise NotFoundError("Chamado não encontrado.", details={"resource": "ticket"})

    @app.get("/test/conflict")
    def conflict() -> None:
        raise ConflictError()

    return app


@pytest.fixture
def error_client(error_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(error_app, raise_server_exceptions=False) as test_client:
        yield test_client


def test_unknown_route_returns_standard_404(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NOT_FOUND", "message": "Recurso não encontrado.", "details": None}
    }


def test_wrong_method_returns_standard_405(client: TestClient) -> None:
    response = client.delete("/api/v1/health")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"
    assert "GET" in response.headers["allow"]


def test_validation_error_does_not_echo_input(error_client: TestClient) -> None:
    response = error_client.post(
        "/test/payload", json={"email": "a@b", "password": SECRET_INPUT, "extra": "x"}
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"]
    details = body["error"]["details"]
    assert {tuple(item["loc"]) for item in details} == {("body", "email"), ("body", "password")}
    for item in details:
        assert set(item) == {"loc", "msg", "type"}
    assert SECRET_INPUT not in response.text
    assert "a@b" not in response.text


def test_app_errors_use_standard_format(error_client: TestClient) -> None:
    response = error_client.get("/test/not-found")
    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "NOT_FOUND",
            "message": "Chamado não encontrado.",
            "details": {"resource": "ticket"},
        }
    }

    response = error_client.get("/test/conflict")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


@pytest.mark.parametrize(
    ("error_cls", "status_code", "code"),
    [
        (BadRequestError, 400, "BAD_REQUEST"),
        (UnauthorizedError, 401, "UNAUTHORIZED"),
        (ForbiddenError, 403, "FORBIDDEN"),
        (NotFoundError, 404, "NOT_FOUND"),
        (ConflictError, 409, "CONFLICT"),
    ],
)
def test_app_error_subclasses(error_cls: type, status_code: int, code: str) -> None:
    error = error_cls()
    assert (error.status_code, error.code) == (status_code, code)
    assert error.message


def test_unhandled_exception_returns_generic_500(
    error_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = error_client.get("/test/boom", headers={"X-Request-ID": "trace-12345678"})

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": INTERNAL_ERROR_MESSAGE, "details": None}
    }
    assert "hunter2" not in response.text
    assert "Traceback" not in response.text
    assert response.headers["x-request-id"] == "trace-12345678"
    # O traceback fica apenas no log do servidor, com o request id.
    records = [record for record in caplog.records if record.name == "app.errors"]
    assert records and records[0].exc_info is not None
    assert getattr(records[0], "request_id", None) == "trace-12345678"


def test_request_id_is_generated(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])


def test_valid_incoming_request_id_is_echoed(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "abc-123-DEF-456"})

    assert response.headers["x-request-id"] == "abc-123-DEF-456"


@pytest.mark.parametrize(
    "malicious",
    [
        "short",
        "abc\r\nSet-Cookie: x=1",
        "<script>alert(1)</script>",
        "a" * 65,
        "../../etc/passwd",
        "id with spaces 123",
    ],
)
def test_unsafe_request_id_is_replaced(client: TestClient, malicious: str) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": malicious})

    request_id = response.headers["x-request-id"]
    assert request_id != malicious
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)


def test_access_log_has_path_without_query_string(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.access"):
        client.get(
            "/api/v1/health?token=secret-token-value", headers={"X-Request-ID": "req-00000001"}
        )

    records = [record for record in caplog.records if record.name == "app.access"]
    assert len(records) == 1
    record = records[0]
    assert record.path == "/api/v1/health"
    assert record.method == "GET"
    assert record.status == 200
    assert isinstance(record.duration_ms, float)
    assert "secret-token-value" not in caplog.text


def test_json_formatter_includes_request_id_and_redacts_secrets() -> None:
    record = logging.LogRecord("app.test", logging.INFO, __file__, 1, "hello %s", ("x",), None)
    record.password = "should-not-appear"
    record.ticket_id = 42
    token = request_id_var.set("req-abcdef12")
    try:
        payload = json.loads(JsonFormatter().format(record))
    finally:
        request_id_var.reset(token)

    assert payload["message"] == "hello x"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.test"
    assert payload["request_id"] == "req-abcdef12"
    assert payload["ticket_id"] == 42
    assert payload["password"] == "[REDACTED]"
    assert payload["timestamp"].endswith("+00:00")
