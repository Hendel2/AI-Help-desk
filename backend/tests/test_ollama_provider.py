"""IA local (Ollama) e cadeia principal → reserva, com transporte HTTP simulado — sem rede."""

import json
from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.services.ai.provider import (
    DEFAULT_OLLAMA_MODEL,
    AIProviderError,
    AIRefusalError,
    ChatTurn,
    FallbackProvider,
    GeminiProvider,
    LLMResult,
    OllamaProvider,
    get_provider,
)

SCHEMA = {
    "type": "object",
    "properties": {"reply": {"type": "string"}},
    "required": ["reply"],
    "additionalProperties": False,
}


def ollama_response(text: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": "qwen3:4b-instruct",
        "message": {"role": "assistant", "content": text},
        "done": True,
        "done_reason": "stop",
        "prompt_eval_count": 737,
        "eval_count": 63,
    }
    body.update(overrides)
    return body


def make_provider(handler: Any) -> tuple[OllamaProvider, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    provider = OllamaProvider(
        base_url="http://ollama:11434/",
        model="qwen3:4b-instruct",
        transport=httpx.MockTransport(record),
    )
    return provider, requests


def test_request_carries_system_history_schema_and_limits() -> None:
    provider, requests = make_provider(
        lambda _: httpx.Response(200, json=ollama_response('{"reply": "ok"}'))
    )

    result = provider.complete(
        system="Você é o assistente.",
        user_content="Ainda não funcionou",
        history=[
            ChatTurn("user", "Minha internet está ruim"),
            ChatTurn("assistant", "É no cabo ou no Wi-Fi?"),
        ],
        max_tokens=1024,
        effort="medium",
        json_schema=SCHEMA,
    )

    request = requests[0]
    assert str(request.url) == "http://ollama:11434/api/chat"
    body = json.loads(request.content)
    assert [(m["role"], m["content"]) for m in body["messages"]] == [
        ("system", "Você é o assistente."),
        ("user", "Minha internet está ruim"),
        ("assistant", "É no cabo ou no Wi-Fi?"),
        ("user", "Ainda não funcionou"),
    ]
    assert body["stream"] is False
    assert body["format"] == SCHEMA  # JSON Schema padrão: decodificação restrita
    assert body["options"]["num_predict"] == 1024
    assert (result.text, result.model) == ('{"reply": "ok"}', "qwen3:4b-instruct")
    assert (result.input_tokens, result.output_tokens) == (737, 63)


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(404, json={"error": "model not found"}), "não encontrado"),
        (httpx.Response(500, json={"error": "x"}), "HTTP 500"),
        (httpx.Response(200, json=ollama_response("{", done_reason="length")), "limite"),
        (httpx.Response(200, json=ollama_response("  ")), "vazia"),
    ],
)
def test_errors_become_provider_errors(response: httpx.Response, message: str) -> None:
    provider, _ = make_provider(lambda _: response)

    with pytest.raises(AIProviderError, match=message):
        provider.complete(system="s", user_content="u", max_tokens=10, effort="low")


def test_unreachable_server_is_a_provider_error() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("conexão recusada", request=request)

    provider, _ = make_provider(refuse)

    with pytest.raises(AIProviderError, match="conectar"):
        provider.complete(system="s", user_content="u", max_tokens=10, effort="low")


class ScriptedProvider:
    """Provedor de teste: devolve o texto ou levanta a exceção recebida."""

    def __init__(self, name: str, outcome: str | Exception) -> None:
        self.name = name
        self.model = f"{name}-model"
        self.outcome = outcome
        self.calls = 0

    def complete(self, **kwargs: Any) -> LLMResult:
        self.calls += 1
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return LLMResult(
            text=self.outcome, model=self.model, input_tokens=1, output_tokens=1, latency_ms=1
        )


def complete(provider: FallbackProvider) -> LLMResult:
    return provider.complete(system="s", user_content="u", max_tokens=10, effort="low")


def test_fallback_answers_when_the_primary_fails() -> None:
    primary = ScriptedProvider("gemini", AIProviderError("Limite de requisições atingido."))
    local = ScriptedProvider("ollama", "resposta local")

    result = complete(FallbackProvider(primary, local))

    assert (result.text, result.model) == ("resposta local", "ollama-model")
    assert (primary.calls, local.calls) == (1, 1)


def test_fallback_is_not_called_when_the_primary_answers() -> None:
    primary = ScriptedProvider("gemini", "resposta")
    local = ScriptedProvider("ollama", "resposta local")

    assert complete(FallbackProvider(primary, local)).text == "resposta"
    assert local.calls == 0


def test_refusal_does_not_switch_provider() -> None:
    primary = ScriptedProvider("gemini", AIRefusalError("recusado"))
    local = ScriptedProvider("ollama", "resposta local")

    with pytest.raises(AIRefusalError):
        complete(FallbackProvider(primary, local))
    assert local.calls == 0


def test_both_failing_raises_for_the_caller_to_use_the_basic_mode() -> None:
    primary = ScriptedProvider("gemini", AIProviderError("fora do ar"))
    local = ScriptedProvider("ollama", AIProviderError("modelo não encontrado"))

    with pytest.raises(AIProviderError):
        complete(FallbackProvider(primary, local))


def configured(settings: Settings, **values: Any) -> Settings:
    return Settings.model_validate({**settings.model_dump(), **values})


def test_factory_builds_the_chain(settings: Settings) -> None:
    provider = get_provider(
        configured(settings, AI_PROVIDER="gemini", AI_API_KEY="abc", AI_FALLBACK_PROVIDER="ollama")
    )

    assert isinstance(provider, FallbackProvider)
    assert isinstance(provider.primary, GeminiProvider)
    assert isinstance(provider.fallback, OllamaProvider)
    assert provider.fallback.model == DEFAULT_OLLAMA_MODEL


def test_factory_uses_the_local_ai_alone_without_a_primary(settings: Settings) -> None:
    # Gemini sem chave é ignorado: a IA local assume sozinha.
    for primary in ("none", "gemini"):
        provider = get_provider(
            configured(
                settings, AI_PROVIDER=primary, AI_API_KEY=None, AI_FALLBACK_PROVIDER="ollama"
            )
        )
        assert isinstance(provider, OllamaProvider)


def test_factory_never_chains_a_provider_with_itself(settings: Settings) -> None:
    provider = get_provider(
        configured(settings, AI_PROVIDER="ollama", AI_FALLBACK_PROVIDER="OLLAMA")
    )

    assert isinstance(provider, OllamaProvider)  # a mesma falha não se repete duas vezes
