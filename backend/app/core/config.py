"""Configuração da aplicação carregada de variáveis de ambiente e arquivos .env."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

APP_NAME = "AI Help Desk API"
APP_VERSION = "0.1.0"

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
# Caminhos absolutos (independentes do diretório atual). Em caso de conflito,
# o arquivo listado por último (backend/.env) tem precedência sobre o da raiz.
ENV_FILES: tuple[Path, ...] = (REPO_ROOT / ".env", BACKEND_DIR / ".env")

# Valor inseguro aceito apenas fora de produção (dev/test sem configuração).
DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me"
MIN_JWT_SECRET_LENGTH = 32

Environment = Literal["development", "test", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILES,
        env_file_encoding="utf-8",
        # O .env da raiz também contém variáveis do MySQL/frontend.
        extra="ignore",
        # "VAR=" vazio no .env equivale a não definir (usa o padrão).
        env_ignore_empty=True,
        # Erros de validação nunca devem ecoar valores (podem conter segredos).
        hide_input_in_errors=True,
    )

    ENVIRONMENT: Environment = "development"
    # Contém credenciais quando aponta para o MySQL: fora do repr.
    DATABASE_URL: str = Field(default="sqlite:///./helpdesk_dev.db", repr=False)
    JWT_SECRET: SecretStr = SecretStr(DEV_JWT_SECRET)
    # Access token curto + refresh token longo (ver app/core/security.py).
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, ge=1, le=1440)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, ge=1, le=90)
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    LOG_LEVEL: LogLevel = "INFO"

    AI_PROVIDER: str = "gemini"
    AI_API_KEY: SecretStr | None = None
    AI_MODEL: str | None = None
    # Reserva quando o provedor principal falha ou a cota acaba ("ollama" ou "none").
    AI_FALLBACK_PROVIDER: str = "none"
    # IA local (Ollama): URL do servidor e modelo (vazio: padrão do provider.py).
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str | None = None
    VECTOR_DB_URL: str = "http://localhost:8001"
    # "chroma" (serviço vector-db) ou "memory" (testes/dev sem Docker; reindexa ao subir).
    VECTOR_STORE_PROVIDER: Literal["chroma", "memory"] = "chroma"

    UPLOAD_DIR: Path = BACKEND_DIR / "uploads"
    MAX_UPLOAD_SIZE_MB: int = Field(default=10, ge=1, le=1024)

    # Limite de requisições em login/cadastro, IA e uploads (§60).
    RATE_LIMIT_ENABLED: bool = True

    # Monitor de SLA embutido na API (alertas de vencimento). 0 = desligado.
    SLA_MONITOR_INTERVAL_SECONDS: int = Field(default=300, ge=0, le=86_400)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.split(",")
        if isinstance(value, list | tuple):
            # Navegadores enviam o Origin sem barra final.
            return [str(item).strip().rstrip("/") for item in value if str(item).strip()]
        return value

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def _normalize_log_level(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("AI_PROVIDER", "AI_FALLBACK_PROVIDER", mode="before")
    @classmethod
    def _normalize_ai_provider(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        if self.ENVIRONMENT != "production":
            return self

        problems: list[str] = []
        secret = self.JWT_SECRET.get_secret_value()
        if not secret or secret == DEV_JWT_SECRET or len(secret) < MIN_JWT_SECRET_LENGTH:
            problems.append(
                f"JWT_SECRET deve ser definido com pelo menos {MIN_JWT_SECRET_LENGTH} "
                "caracteres (o valor padrão de desenvolvimento não é aceito)"
            )
        if self.DATABASE_URL.strip().lower().startswith("sqlite"):
            problems.append("DATABASE_URL não pode usar SQLite em produção")
        if "*" in self.CORS_ORIGINS:
            problems.append("CORS_ORIGINS não pode conter '*' em produção")
        if problems:
            raise ValueError("Configuração inválida para produção: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
