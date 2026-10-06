from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import APP_VERSION
from app.core.database import create_db_engine
from app.services import health as health_service


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "version": APP_VERSION}


def test_health_returns_503_when_database_is_unavailable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(health_service, "check_database", lambda _session: False)

    response = client.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "database": "unavailable",
        "version": APP_VERSION,
    }


def test_check_database_handles_sqlalchemy_errors(tmp_path: Path) -> None:
    # Diretório inexistente: o SQLite não consegue abrir o arquivo.
    broken_engine = create_db_engine(f"sqlite:///{tmp_path / 'missing' / 'db.sqlite'}")
    with Session(broken_engine) as session:
        assert health_service.check_database(session) is False
    broken_engine.dispose()


def test_docs_available_outside_production(client: TestClient) -> None:
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").status_code == 200
