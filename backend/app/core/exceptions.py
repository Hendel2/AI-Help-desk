"""Exceções da aplicação e handlers que renderizam TODOS os erros no formato padrão:

{"error": {"code": "STRING_CODE", "message": "texto", "details": <opcional>}}
"""

import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.middleware import REQUEST_ID_HEADER

logger = logging.getLogger("app.errors")

INTERNAL_ERROR_MESSAGE = "Ocorreu um erro interno. Tente novamente mais tarde."
VALIDATION_ERROR_MESSAGE = "Os dados enviados são inválidos."

# Códigos e mensagens (pt-BR) para erros HTTP gerados pelo framework.
_HTTP_ERRORS: dict[int, tuple[str, str]] = {
    400: ("BAD_REQUEST", "Requisição inválida."),
    401: ("UNAUTHORIZED", "Autenticação necessária."),
    403: ("FORBIDDEN", "Você não tem permissão para executar esta ação."),
    404: ("NOT_FOUND", "Recurso não encontrado."),
    405: ("METHOD_NOT_ALLOWED", "Método não permitido para este recurso."),
    409: ("CONFLICT", "A operação conflita com o estado atual do recurso."),
    413: ("PAYLOAD_TOO_LARGE", "O conteúdo enviado excede o tamanho permitido."),
    415: ("UNSUPPORTED_MEDIA_TYPE", "Tipo de conteúdo não suportado."),
    429: ("TOO_MANY_REQUESTS", "Muitas requisições. Aguarde e tente novamente."),
}


class AppError(Exception):
    """Erro de domínio/aplicação com status HTTP e código estável para o frontend."""

    status_code: int = 400
    code: str = "APP_ERROR"
    message: str = "Não foi possível concluir a operação."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.details = details
        self.headers = headers
        super().__init__(self.message)


class BadRequestError(AppError):
    status_code = 400
    code = "BAD_REQUEST"
    message = "Requisição inválida."


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Autenticação necessária."


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "Você não tem permissão para executar esta ação."


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "Recurso não encontrado."


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    message = "A operação conflita com o estado atual do recurso."


class TooManyRequestsError(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    message = "Muitas requisições. Tente novamente em instantes."


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = {"error": {"code": code, "message": message, "details": jsonable_encoder(details)}}
    return JSONResponse(status_code=status_code, content=body, headers=headers)


async def _app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details, exc.headers)


async def _http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    default_code, default_message = _HTTP_ERRORS.get(
        exc.status_code, ("HTTP_ERROR", "Não foi possível processar a requisição.")
    )
    message, details = default_message, None
    try:
        default_phrase = HTTPStatus(exc.status_code).phrase
    except ValueError:
        default_phrase = None
    if isinstance(exc.detail, str):
        # Mensagem explícita do código é mantida; a frase padrão em inglês é traduzida.
        if exc.detail and exc.detail != default_phrase:
            message = exc.detail
    elif exc.detail is not None:
        details = exc.detail
    return error_response(exc.status_code, default_code, message, details, exc.headers)


async def _validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Nunca ecoar `input`/`ctx`: podem conter senhas ou dados pessoais.
    details = [
        {"loc": list(error.get("loc", ())), "msg": error.get("msg", ""), "type": error.get("type")}
        for error in exc.errors()
    ]
    return error_response(422, "VALIDATION_ERROR", VALIDATION_ERROR_MESSAGE, details)


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Executado pelo ServerErrorMiddleware (fora do RequestContextMiddleware):
    # o request id vem de `request.state`. O traceback fica só no log do servidor.
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        "Unhandled exception while processing request",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra={"request_id": request_id, "method": request.method, "path": request.url.path},
    )
    headers = {REQUEST_ID_HEADER: request_id} if request_id else None
    return error_response(500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE, headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)
