"""Interface com o provedor de LLM (§3.3, §67).

O resto da aplicação conversa apenas com `LLMProvider`. Trocar de provedor
significa escrever outra implementação desta interface — nenhuma regra de
negócio conhece o SDK.

O padrão é `AI_PROVIDER=gemini` (só vale com `AI_API_KEY`). `none` não cria
provedor: cada tarefa de IA usa sua heurística local, e o sistema continua
funcional sem chave de API.

No Gemini, um segundo modelo na nuvem (`GEMINI_BACKUP_MODEL`) cobre lentidão e
falhas do principal em segundos. `AI_FALLBACK_PROVIDER` (ex.: `ollama`, a IA local
do compose) é o reserva: se o Gemini falhar — fora do ar, cota esgotada, erro —, a
mesma chamada vai para ele. Só se todos falharem o recurso cai para a heurística
local.
"""

import functools
import logging
import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass, replace
from typing import Any, Literal, Protocol

import anthropic
import httpx

from app.core.config import Settings

logger = logging.getLogger("app.ai.provider")

Effort = Literal["low", "medium", "high"]

DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5"
#: Rápido (~1 s por resposta no chat, sem etapa de raciocínio) e bem menos disputado que
#: o Flash, que chega a ~10 s e recusa com 503 em horários de pico. Para respostas mais
#: elaboradas: AI_MODEL=gemini-3.8-flash.
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
#: Modelo de apoio na nuvem (outra faixa de capacidade, ~1,7 s por resposta com
#: raciocínio curto): entra quando o principal demora ou falha — bem antes da IA local,
#: que leva dezenas de segundos no processador. O gemini-3.1-flash-lite foi descartado:
#: em 2026-10-23 alternou entre 1,3 s e 503/tempo esgotado.
GEMINI_BACKUP_MODEL = "gemini-3.5-flash"
#: Sem resposta do principal nesse tempo, a pergunta vai também para o modelo de apoio
#: e vale a primeira resposta. Normal: 1–5 s (Copilot até ~5 s); em pico o
#: principal chegou a 15–36 s e a devolver 503 depois de ~30 s.
GEMINI_HEDGE_AFTER_SECONDS = 6.0
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
#: Modelo local leve (2,5 GB), responde direto (sem etapa de raciocínio) e roda no processador.
DEFAULT_OLLAMA_MODEL = "qwen3:4b-instruct"
#: Janela de contexto da IA local: prompt do chat + histórico + trechos da base.
OLLAMA_CONTEXT_TOKENS = 8192
#: Recusa por segurança: o servidor reexecuta no modelo recomendado pela categoria.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass(frozen=True)
class ChatTurn:
    """Turno anterior da conversa enviado como histórico ao modelo."""

    role: Literal["user", "assistant"]
    text: str


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
        history: Sequence[ChatTurn] = (),
    ) -> LLMResult:
        """Uma chamada de texto. Com `json_schema`, a resposta é JSON nesse formato.

        `history` são os turnos anteriores da conversa; `user_content` é o turno atual.
        """
        ...


def _merge_turns(history: Sequence[ChatTurn], user_content: str) -> list[ChatTurn]:
    """Histórico + turno atual, alternando papéis e sempre começando pelo usuário."""
    turns: list[ChatTurn] = []
    for turn in [*history, ChatTurn("user", user_content)]:
        if not turn.text.strip():
            continue
        if not turns and turn.role == "assistant":
            continue  # a conversa enviada ao modelo começa pelo usuário
        if turns and turns[-1].role == turn.role:
            turns[-1] = ChatTurn(turn.role, turns[-1].text + "\n\n" + turn.text)
        else:
            turns.append(turn)
    return turns


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
        history: Sequence[ChatTurn] = (),
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
                messages=[
                    {"role": turn.role, "content": turn.text}
                    for turn in _merge_turns(history, user_content)
                ],
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


# --- Google Gemini ---------------------------------------------------------------

_GEMINI_REFUSALS = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"}
#: Nível de raciocínio do Gemini 3 por esforço. Sem isso, o modelo pensa centenas de
#: tokens antes de cada resposta (~10 s no chat). "minimal" não é aceito no Flash 3.8;
#: esforço "high" fica com o padrão do modelo.
_GEMINI_THINKING: dict[Effort, str] = {"low": "low", "medium": "low"}
#: Corrida entre o modelo principal e o de apoio (chamadas HTTP bloqueantes).
_GEMINI_POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix="gemini")
_GEMINI_TYPES = {
    "object": "OBJECT",
    "array": "ARRAY",
    "string": "STRING",
    "integer": "INTEGER",
    "number": "NUMBER",
    "boolean": "BOOLEAN",
}


def to_gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """JSON Schema → subconjunto OpenAPI aceito em `responseSchema` (tipos em maiúsculas,
    sem `additionalProperties`). A resposta continua validada com Pydantic depois."""
    converted: dict[str, Any] = {}
    for key, value in schema.items():
        if key == "type":
            converted["type"] = _GEMINI_TYPES.get(str(value), str(value).upper())
        elif key == "properties":
            converted["properties"] = {name: to_gemini_schema(sub) for name, sub in value.items()}
            converted["propertyOrdering"] = list(value)
        elif key == "items":
            converted["items"] = to_gemini_schema(value)
        elif key in ("required", "enum", "description", "nullable", "minimum", "maximum"):
            converted[key] = value
    return converted


class GeminiProvider:
    """Gemini via API REST (`generateContent`), sem SDK: só `httpx`.

    Com `backup_model`, uma pergunta nunca fica presa num modelo congestionado: se
    o principal falha ou passa de `hedge_after_seconds` sem responder, a mesma
    pergunta vai também para o modelo de apoio (cota e fila próprias) e vale a
    primeira resposta que chegar.
    """

    name = "gemini"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        backup_model: str | None = None,
        hedge_after_seconds: float = GEMINI_HEDGE_AFTER_SECONDS,
        timeout_seconds: float = 25.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.model = model
        self.backup_model = backup_model if backup_model != model else None
        self.hedge_after_seconds = hedge_after_seconds
        # A chave vai no cabeçalho (nunca na URL, que pode parar em logs).
        self.client = httpx.Client(
            base_url=GEMINI_API_URL,
            headers={"x-goog-api-key": api_key},
            timeout=timeout_seconds,
            transport=transport,
        )

    def complete(
        self,
        *,
        system: str,
        user_content: str,
        max_tokens: int,
        effort: Effort,
        json_schema: dict[str, Any] | None = None,
        history: Sequence[ChatTurn] = (),
    ) -> LLMResult:
        call = functools.partial(
            self._call,
            system=system,
            user_content=user_content,
            max_tokens=max_tokens,
            effort=effort,
            json_schema=json_schema,
            history=history,
        )
        if self.backup_model is None:
            return call(self.model, retry=True)

        started = time.perf_counter()
        primary = _GEMINI_POOL.submit(call, self.model, retry=False)
        try:
            return primary.result(timeout=self.hedge_after_seconds)
        except FutureTimeoutError:
            reason, contenders = "sem resposta a tempo", [primary]
        except AIRefusalError:
            raise
        except AIProviderError as exc:
            reason, contenders = str(exc), []

        logger.info(
            "Modelo Gemini principal %s; consultando também o de apoio",
            reason,
            extra={"model": self.model, "backup_model": self.backup_model},
        )
        contenders.append(_GEMINI_POOL.submit(call, self.backup_model, retry=False))
        error: AIProviderError | None = None
        for future in as_completed(contenders):
            try:
                result = future.result()
            except AIRefusalError:
                raise
            except AIProviderError as exc:
                error = exc
                continue
            # Latência = o que a pessoa esperou, desde a primeira tentativa.
            return replace(result, latency_ms=int((time.perf_counter() - started) * 1000))
        assert error is not None
        raise error

    def _call(
        self,
        model: str,
        *,
        retry: bool,
        system: str,
        user_content: str,
        max_tokens: int,
        effort: Effort,
        json_schema: dict[str, Any] | None,
        history: Sequence[ChatTurn],
    ) -> LLMResult:
        generation: dict[str, Any] = {"maxOutputTokens": max_tokens}
        level = _GEMINI_THINKING.get(effort)
        # Gemini 2.x usa outro parâmetro (thinkingBudget): fica com o padrão do modelo.
        if level and not model.startswith("gemini-2"):
            generation["thinkingConfig"] = {"thinkingLevel": level}
        if json_schema is not None:
            generation["responseMimeType"] = "application/json"
            generation["responseSchema"] = to_gemini_schema(json_schema)
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [
                {
                    "role": "user" if turn.role == "user" else "model",
                    "parts": [{"text": turn.text}],
                }
                for turn in _merge_turns(history, user_content)
            ],
            "generationConfig": generation,
        }

        started = time.perf_counter()
        response = self._post(model, body, retry=retry)
        latency_ms = int((time.perf_counter() - started) * 1000)
        data = response.json()

        if (data.get("promptFeedback") or {}).get("blockReason"):
            raise AIRefusalError("O provedor de IA bloqueou a solicitação.")
        candidates = data.get("candidates") or []
        if not candidates:
            raise AIProviderError("O provedor de IA não retornou resposta.")
        candidate = candidates[0]
        finish = candidate.get("finishReason")
        if finish in _GEMINI_REFUSALS:
            raise AIRefusalError("O modelo recusou a solicitação.")
        if finish == "MAX_TOKENS":
            raise AIProviderError("Resposta da IA interrompida pelo limite de tokens.")

        parts = (candidate.get("content") or {}).get("parts") or []
        # Partes de raciocínio ("thought") não fazem parte da resposta.
        text = "".join(part.get("text", "") for part in parts if not part.get("thought"))
        if not text.strip():
            raise AIProviderError("O provedor de IA retornou uma resposta vazia.")
        usage = data.get("usageMetadata") or {}
        output_tokens = (usage.get("candidatesTokenCount") or 0) + (
            usage.get("thoughtsTokenCount") or 0
        )
        return LLMResult(
            text=text,
            model=data.get("modelVersion") or model,
            input_tokens=usage.get("promptTokenCount"),
            output_tokens=output_tokens or None,
            latency_ms=latency_ms,
        )

    def _post(self, model: str, body: dict[str, Any], *, retry: bool) -> httpx.Response:
        """Com `retry`, uma nova tentativa para falhas transitórias (5xx ou rede).

        Com modelo de apoio não há nova tentativa no mesmo modelo: um 503 do Gemini
        pode levar dezenas de segundos para chegar, e o apoio já é a segunda chance.
        """
        for attempt in range(2 if retry else 1):
            last = attempt == (1 if retry else 0)
            try:
                response = self.client.post(f"/{model}:generateContent", json=body)
            except httpx.TransportError as exc:
                if not last:
                    continue
                raise AIProviderError("Não foi possível conectar ao provedor de IA.") from exc
            if response.status_code >= 500 and not last:
                time.sleep(0.5)
                continue
            if response.status_code == 429:
                raise AIProviderError("Limite de requisições do provedor de IA atingido.")
            if response.status_code >= 400:
                raise AIProviderError(f"Erro do provedor de IA (HTTP {response.status_code}).")
            return response
        raise AIProviderError("O provedor de IA não respondeu.")  # pragma: no cover


# --- IA local (Ollama) ---------------------------------------------------------------


class OllamaProvider:
    """Modelo local via Ollama (API REST `/api/chat`), sem SDK: só `httpx`.

    Roda na própria infraestrutura (serviço `ollama` do compose): sem chave, sem cota
    e sem enviar conversas para fora. No processador, cada resposta leva dezenas de
    segundos — por isso o tempo limite é maior que o dos provedores em nuvem.
    """

    name = "ollama"

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout_seconds: float = 120.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.model = model
        self.client = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout_seconds, transport=transport
        )

    def complete(
        self,
        *,
        system: str,
        user_content: str,
        max_tokens: int,
        effort: Effort,
        json_schema: dict[str, Any] | None = None,
        history: Sequence[ChatTurn] = (),
    ) -> LLMResult:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                *(
                    {"role": turn.role, "content": turn.text}
                    for turn in _merge_turns(history, user_content)
                ),
            ],
            "stream": False,
            "options": {"num_predict": max_tokens, "num_ctx": OLLAMA_CONTEXT_TOKENS},
            # Mantém o modelo carregado entre mensagens (carregar leva alguns segundos).
            "keep_alive": "30m",
        }
        if json_schema is not None:
            body["format"] = json_schema  # decodificação restrita ao schema

        started = time.perf_counter()
        try:
            response = self.client.post("/api/chat", json=body)
        except httpx.TimeoutException as exc:
            raise AIProviderError("A IA local demorou demais para responder.") from exc
        except httpx.TransportError as exc:
            raise AIProviderError("Não foi possível conectar à IA local.") from exc
        latency_ms = int((time.perf_counter() - started) * 1000)
        if response.status_code == 404:
            raise AIProviderError("Modelo da IA local não encontrado (ainda sendo baixado?).")
        if response.status_code >= 400:
            raise AIProviderError(f"Erro da IA local (HTTP {response.status_code}).")

        data = response.json()
        if data.get("done_reason") == "length":
            raise AIProviderError("Resposta da IA interrompida pelo limite de tokens.")
        text = (data.get("message") or {}).get("content") or ""
        if not text.strip():
            raise AIProviderError("A IA local retornou uma resposta vazia.")
        return LLMResult(
            text=text,
            model=data.get("model") or self.model,
            input_tokens=data.get("prompt_eval_count"),
            output_tokens=data.get("eval_count"),
            latency_ms=latency_ms,
        )


class FallbackProvider:
    """Provedor principal com um reserva para falhas técnicas.

    Fora do ar, cota esgotada ou erro no principal → a mesma chamada vai para o
    reserva. Recusas (`AIRefusalError`) não trocam de provedor: são decisão sobre o
    conteúdo, não falha.
    """

    def __init__(self, primary: LLMProvider, fallback: LLMProvider) -> None:
        self.primary = primary
        self.fallback = fallback
        self.name = f"{primary.name}+{fallback.name}"
        self.model = primary.model

    def complete(
        self,
        *,
        system: str,
        user_content: str,
        max_tokens: int,
        effort: Effort,
        json_schema: dict[str, Any] | None = None,
        history: Sequence[ChatTurn] = (),
    ) -> LLMResult:
        call = {
            "system": system,
            "user_content": user_content,
            "max_tokens": max_tokens,
            "effort": effort,
            "json_schema": json_schema,
            "history": history,
        }
        try:
            return self.primary.complete(**call)
        except AIRefusalError:
            raise
        except AIProviderError as exc:
            logger.warning(
                "Provedor de IA principal falhou; usando o reserva",
                extra={
                    "provider": self.primary.name,
                    "fallback": self.fallback.name,
                    "error": str(exc),
                },
            )
            return self.fallback.complete(**call)


def _build_provider(name: str, settings: Settings, *, model: str | None) -> LLMProvider | None:
    if name in ("", "none", "local"):
        return None
    api_key = settings.AI_API_KEY.get_secret_value() if settings.AI_API_KEY else None
    if name == "anthropic":
        return AnthropicProvider(api_key=api_key, model=model or DEFAULT_ANTHROPIC_MODEL)
    if name == "gemini":
        if not api_key:
            logger.warning("Provedor gemini sem AI_API_KEY; ignorado")
            return None
        return GeminiProvider(
            api_key=api_key,
            model=model or DEFAULT_GEMINI_MODEL,
            backup_model=GEMINI_BACKUP_MODEL,
        )
    if name == "ollama":
        return OllamaProvider(
            base_url=settings.OLLAMA_URL, model=settings.OLLAMA_MODEL or DEFAULT_OLLAMA_MODEL
        )
    logger.warning("Provedor de IA desconhecido; ignorado", extra={"provider": name})
    return None


def get_provider(settings: Settings) -> LLMProvider | None:
    """Provedor principal (com o reserva, se houver) ou `None` (modo sem IA)."""
    primary = _build_provider(settings.AI_PROVIDER, settings, model=settings.AI_MODEL)
    fallback = None
    if settings.AI_FALLBACK_PROVIDER != settings.AI_PROVIDER:
        fallback = _build_provider(settings.AI_FALLBACK_PROVIDER, settings, model=None)
    if primary is not None and fallback is not None:
        return FallbackProvider(primary, fallback)
    return primary or fallback
