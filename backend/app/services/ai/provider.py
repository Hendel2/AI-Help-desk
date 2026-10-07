"""Interface com o provedor de LLM (§3.3, §67).

O resto da aplicação conversa apenas com `LLMProvider`. Trocar de provedor
significa escrever outra implementação desta interface — nenhuma regra de
negócio conhece o SDK.

`AI_PROVIDER=none` (padrão) não cria provedor: cada tarefa de IA usa sua
heurística local, e o sistema continua funcional sem chave de API.
"""

import logging
import time
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import anthropic

from app.core.config import Settings

logger = logging.getLogger("app.ai.provider")

Effort = Literal["low", "medium", "high"]

DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5"
#: Recusa por segurança: o servidor reexecuta no modelo recomendado pela categoria.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass(frozen=True)
class LLMResult:
    text: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int


class AIProviderError(Exception):
    """Falha ao consultar o provedor. A mensagem é segura para logs (sem conteúdo)."""


class AIRefusalError(AIProviderError):
    """O modelo recusou a solicitação (stop_reason = refusal)."""


class LLMProvider(Protocol):
    name: str
    model: str

    def complete(
        self,
        *,
        system: str,
        user_content: str,
        max_tokens: int,
        effort: Effort,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResult:
        """Uma chamada de texto. Com `json_schema`, a resposta é JSON nesse formato."""
        ...


class AnthropicProvider:
    """Claude via SDK oficial (`anthropic`)."""

    name = "anthropic"

    def __init__(self, *, api_key: str | None, model: str, timeout_seconds: float = 60.0) -> None:
        # Sem chave explícita, o SDK resolve credenciais do ambiente (ANTHROPIC_API_KEY...).
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout_seconds, max_retries=2)
        self.model = model

    def complete(
        self,
        *,
        system: str,
        user_content: str,
        max_tokens: int,
        effort: Effort,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResult:
        output_config: dict[str, Any] = {"effort": effort}
        if json_schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": json_schema}

        started = time.perf_counter()
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_content}],
                output_config=output_config,
                betas=[_FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.RateLimitError as exc:
            raise AIProviderError("Limite de requisições do provedor de IA atingido.") from exc
        except anthropic.APIStatusError as exc:
            raise AIProviderError(f"Erro do provedor de IA (HTTP {exc.status_code}).") from exc
        except anthropic.APIConnectionError as exc:
            raise AIProviderError("Não foi possível conectar ao provedor de IA.") from exc
        latency_ms = int((time.perf_counter() - started) * 1000)

        if response.stop_reason == "refusal":
            raise AIRefusalError("O modelo recusou a solicitação.")
        if response.stop_reason == "max_tokens":
            raise AIProviderError("Resposta da IA interrompida pelo limite de tokens.")

        text = "".join(block.text for block in response.content if block.type == "text")
        usage = response.usage
        return LLMResult(
            text=text,
            model=response.model,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
            latency_ms=latency_ms,
        )


def get_provider(settings: Settings) -> LLMProvider | None:
    """Provedor configurado ou `None` (modo local/heurístico)."""
    if settings.AI_PROVIDER in ("", "none", "local"):
        return None
    if settings.AI_PROVIDER == "anthropic":
        api_key = settings.AI_API_KEY.get_secret_value() if settings.AI_API_KEY else None
        return AnthropicProvider(
            api_key=api_key, model=settings.AI_MODEL or DEFAULT_ANTHROPIC_MODEL
        )
    logger.warning(
        "AI_PROVIDER desconhecido; usando modo local", extra={"provider": settings.AI_PROVIDER}
    )
    return None
