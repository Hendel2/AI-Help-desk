"""Logs estruturados em JSON (stdlib) com o request id da requisição corrente."""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Atributos padrão de LogRecord: tudo o que não estiver aqui veio de `extra=`.
# `color_message` é a versão com códigos ANSI que o uvicorn anexa aos seus logs.
_STANDARD_RECORD_ATTRS = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {
    "message",
    "asctime",
    "taskName",
    "color_message",
}

# Campos extras com estes trechos no nome nunca são registrados em claro.
_SENSITIVE_KEY_PARTS = ("password", "secret", "token", "api_key", "authorization", "cookie")
_REDACTED = "[REDACTED]"

_HANDLER_MARKER = "_helpdesk_json_handler"


def get_request_id() -> str | None:
    return request_id_var.get()


def _is_sensitive(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in _SENSITIVE_KEY_PARTS)


class JsonFormatter(logging.Formatter):
    """Serializa cada registro como uma linha JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            # `extra={"request_id": ...}` tem precedência (ex.: handlers executados
            # fora do contexto do middleware).
            "request_id": getattr(record, "request_id", None) or get_request_id(),
        }
        for key, value in record.__dict__.items():
            if key in _STANDARD_RECORD_ATTRS or key.startswith("_") or key in payload:
                continue
            payload[key] = _REDACTED if _is_sensitive(key) else value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack_info"] = self.formatStack(record.stack_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    """Instala o handler JSON no logger raiz (idempotente)."""
    root = logging.getLogger()
    for handler in list(root.handlers):
        if getattr(handler, _HANDLER_MARKER, False):
            root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    setattr(handler, _HANDLER_MARKER, True)
    root.addHandler(handler)
    root.setLevel(level.upper())

    # Logs do uvicorn passam pelo mesmo formato JSON. O access log do uvicorn é
    # substituído pelo do RequestContextMiddleware (inclui request id e duração).
    for name in ("uvicorn", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.propagate = False
    access_logger.disabled = True
