"""Ponto de entrada da API: `uvicorn app.main:app`."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import APP_NAME, APP_VERSION, Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import REQUEST_ID_HEADER, RequestContextMiddleware
from app.schemas.common import ErrorResponse

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    # Documentação interativa desabilitada em produção.
    docs_enabled = not settings.is_production
    app = FastAPI(
        title=APP_NAME,
        version=APP_VERSION,
        docs_url="/api/docs" if docs_enabled else None,
        swagger_ui_oauth2_redirect_url="/api/docs/oauth2-redirect" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs_enabled else None,
        responses={
            422: {"model": ErrorResponse, "description": "Dados inválidos"},
            500: {"model": ErrorResponse, "description": "Erro interno"},
        },
    )
    app.state.settings = settings

    # A ordem importa: o último middleware adicionado é o mais externo.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)
    return app


app = create_app()
