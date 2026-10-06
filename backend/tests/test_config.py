from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import (
    BACKEND_DIR,
    DEV_JWT_SECRET,
    ENV_FILES,
    REPO_ROOT,
    Settings,
)
from app.main import create_app

STRONG_SECRET = "x" * 48
MYSQL_URL = "mysql+pymysql://helpdesk:db-password@mysql:3306/helpdesk"

CANONICAL_VARS = (
    "ENVIRONMENT",
    "DATABASE_URL",
    "JWT_SECRET",
    "CORS_ORIGINS",
    "LOG_LEVEL",
    "AI_PROVIDER",
    "AI_API_KEY",
    "AI_MODEL",
    "VECTOR_DB_URL",
    "UPLOAD_DIR",
    "MAX_UPLOAD_SIZE_MB",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Isola os testes das variáveis do ambiente local."""
    for name in CANONICAL_VARS:
        monkeypatch.delenv(name, raising=False)


def make_settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)


def production(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "ENVIRONMENT": "production",
        "DATABASE_URL": MYSQL_URL,
        "JWT_SECRET": STRONG_SECRET,
        "CORS_ORIGINS": "https://helpdesk.example.com",
    }
    values.update(overrides)
    return make_settings(**values)


def test_defaults_are_safe_for_local_development() -> None:
    settings = make_settings()

    assert settings.ENVIRONMENT == "development"
    assert settings.DATABASE_URL.startswith("sqlite")
    assert settings.CORS_ORIGINS == ["http://localhost:5173"]
    assert settings.AI_PROVIDER == "none"
    assert settings.AI_API_KEY is None
    assert settings.is_production is False


def test_env_files_are_absolute_and_independent_of_cwd() -> None:
    assert ENV_FILES == (REPO_ROOT / ".env", BACKEND_DIR / ".env")
    assert all(path.is_absolute() for path in ENV_FILES)
    assert (BACKEND_DIR / "app" / "main.py").is_file()


def test_reads_environment_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://a.example.com, http://b.example.com/ ,")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    monkeypatch.setenv("AI_API_KEY", "sk-test")

    settings = make_settings()

    assert settings.CORS_ORIGINS == ["http://a.example.com", "http://b.example.com"]
    assert settings.LOG_LEVEL == "DEBUG"
    assert settings.AI_API_KEY is not None
    assert settings.AI_API_KEY.get_secret_value() == "sk-test"


def test_reads_env_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "CORS_ORIGINS=http://x.example.com\nJWT_SECRET=\nMYSQL_PASSWORD=ignored\n",
        encoding="utf-8",
    )

    settings = Settings(_env_file=env_file)

    assert settings.CORS_ORIGINS == ["http://x.example.com"]
    # Valor vazio no .env equivale a não definir.
    assert settings.JWT_SECRET.get_secret_value() == DEV_JWT_SECRET


@pytest.mark.parametrize(
    "value",
    ["http://localhost:5173", "http://localhost:5173/", " http://localhost:5173 ,"],
)
def test_cors_origins_parsing(value: str) -> None:
    assert make_settings(CORS_ORIGINS=value).CORS_ORIGINS == ["http://localhost:5173"]


def test_valid_production_settings() -> None:
    settings = production()

    assert settings.is_production
    assert settings.CORS_ORIGINS == ["https://helpdesk.example.com"]


@pytest.mark.parametrize("secret", [DEV_JWT_SECRET, "", "short-secret", "y" * 31])
def test_production_rejects_weak_jwt_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET") as exc_info:
        production(JWT_SECRET=secret)
    if secret:
        assert secret not in str(exc_info.value)


def test_production_rejects_default_jwt_secret_when_unset() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        make_settings(
            ENVIRONMENT="production",
            DATABASE_URL=MYSQL_URL,
            CORS_ORIGINS="https://helpdesk.example.com",
        )


@pytest.mark.parametrize("url", ["sqlite:///./helpdesk.db", "sqlite://", "SQLITE:///x.db"])
def test_production_rejects_sqlite(url: str) -> None:
    with pytest.raises(ValidationError, match="SQLite"):
        production(DATABASE_URL=url)


@pytest.mark.parametrize("origins", ["*", "https://helpdesk.example.com,*"])
def test_production_rejects_wildcard_cors(origins: str) -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        production(CORS_ORIGINS=origins)


def test_validation_errors_do_not_leak_values() -> None:
    with pytest.raises(ValidationError) as exc_info:
        production(JWT_SECRET="short-but-secret", DATABASE_URL="sqlite:///./x.db")

    message = str(exc_info.value)
    assert "short-but-secret" not in message
    assert "db-password" not in message


def test_repr_hides_secrets_and_database_credentials() -> None:
    text = repr(production(AI_API_KEY="sk-live-value"))

    assert STRONG_SECRET not in text
    assert "sk-live-value" not in text
    assert "db-password" not in text


def test_non_production_accepts_development_defaults() -> None:
    settings = make_settings(ENVIRONMENT="test", CORS_ORIGINS="*")

    assert settings.CORS_ORIGINS == ["*"]


def test_docs_disabled_in_production() -> None:
    client = TestClient(create_app(production()))

    assert client.get("/api/docs").status_code == 404
    assert client.get("/api/openapi.json").status_code == 404
