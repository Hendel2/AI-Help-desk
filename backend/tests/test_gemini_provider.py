"""Provedor Gemini (REST) com transporte HTTP simulado — sem rede."""

import json
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.services.ai import provider as provider_module
from app.services.ai.provider import (
    DEFAULT_GEMINI_MODEL,
    GEMINI_BACKUP_MODEL,
    AIProviderError,
    AIRefusalError,
    ChatTurn,
    GeminiProvider,
    get_provider,
    to_gemini_schema,
)

SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "status": {"type": "string", "enum": ["troubleshooting", "escalate"]},
        "used_source_ids": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["reply", "status", "used_source_ids"],
    "additionalProperties": False,
}


def gemini_response(text: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "candidates": [
            {
                "content": {
                    "role": "model",
                    "parts": [{"text": "pensando...", "thought": True}, {"text": text}],
                },
                "finishReason": "STOP",
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 120,
            "candidatesTokenCount": 30,
            "thoughtsTokenCount": 10,
        },
        "modelVersion": "gemini-3.8-flash-001",
    }
    body.update(overrides)
    return body


def make_provider(handler: Any) -> tuple[GeminiProvider, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    provider = GeminiProvider(
        api_key="chave-de-teste", model="gemini-3.8-flash", transport=httpx.MockTransport(record)
    )
    return provider, requests


def test_request_carries_system_history_and_converted_schema() -> None:
    provider, requests = make_provider(
        lambda _: httpx.Response(200, json=gemini_response('{"ok": true}'))
    )

    result = provider.complete(
        system="Você é o assistente.",
        user_content="Ainda não funcionou",
        history=[
            ChatTurn("assistant", "saudação solta (descartada: começa pelo usuário)"),
            ChatTurn("user", "Mouse com mal contato"),
            ChatTurn("assistant", "Já trocou a porta USB?"),
        ],
        max_tokens=1024,
        effort="medium",
        json_schema=SCHEMA,
    )

    request = requests[0]
    assert request.url.path.endswith("/models/gemini-3.8-flash:generateContent")
    assert request.headers["x-goog-api-key"] == "chave-de-teste"
    assert "key=" not in str(request.url)  # chave nunca na URL
    body = json.loads(request.content)
    assert body["systemInstruction"] == {"parts": [{"text": "Você é o assistente."}]}
    assert [(c["role"], c["parts"][0]["text"]) for c in body["contents"]] == [
        ("user", "Mouse com mal contato"),
        ("model", "Já trocou a porta USB?"),
        ("user", "Ainda não funcionou"),
    ]
    config = body["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["responseSchema"]["type"] == "OBJECT"
    assert "additionalProperties" not in config["responseSchema"]
    assert config["maxOutputTokens"] == 1024
    # Raciocínio curto: o padrão do modelo leva ~10 s por resposta no chat.
    assert config["thinkingConfig"] == {"thinkingLevel": "low"}
    # Resposta: sem as partes de raciocínio; tokens de saída incluem o raciocínio.
    assert result.text == '{"ok": true}'
    assert (result.input_tokens, result.output_tokens) == (120, 40)
    assert result.model == "gemini-3.8-flash-001"


@pytest.mark.parametrize(
    ("model", "effort"), [("gemini-3.8-flash", "high"), ("gemini-2.5-flash", "medium")]
)
def test_thinking_level_is_left_to_the_model_when_not_applicable(model: str, effort: Any) -> None:
    requests: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=gemini_response("ok"))

    provider = GeminiProvider(api_key="k", model=model, transport=httpx.MockTransport(record))
    provider.complete(system="s", user_content="u", max_tokens=10, effort=effort)

    assert "thinkingConfig" not in json.loads(requests[0].content)["generationConfig"]


def test_schema_conversion_keeps_structure() -> None:
    converted = to_gemini_schema(SCHEMA)

    assert converted["required"] == ["reply", "status", "used_source_ids"]
    assert converted["propertyOrdering"] == ["reply", "status", "used_source_ids"]
    assert converted["properties"]["status"] == {
        "type": "STRING",
        "enum": ["troubleshooting", "escalate"],
    }
    assert converted["properties"]["used_source_ids"]["items"] == {"type": "INTEGER"}


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx.Response(429, json={}), AIProviderError),
        (httpx.Response(400, json={"error": {"message": "x"}}), AIProviderError),
        (httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}), AIRefusalError),
        (
            httpx.Response(200, json=gemini_response("x", candidates=[{"finishReason": "SAFETY"}])),
            AIRefusalError,
        ),
        (
            httpx.Response(
                200, json=gemini_response("x", candidates=[{"finishReason": "MAX_TOKENS"}])
            ),
            AIProviderError,
        ),
        (httpx.Response(200, json={"candidates": []}), AIProviderError),
    ],
)
def test_errors_become_provider_errors(response: httpx.Response, error: type[Exception]) -> None:
    provider, _ = make_provider(lambda _: response)

    with pytest.raises(error):
        provider.complete(system="s", user_content="u", max_tokens=10, effort="low")


def test_retries_once_on_transient_server_error() -> None:
    answers = iter([httpx.Response(503), httpx.Response(200, json=gemini_response("ok"))])
    provider, requests = make_provider(lambda _: next(answers))

    result = provider.complete(system="s", user_content="u", max_tokens=10, effort="low")

    assert result.text == "ok"
    assert len(requests) == 2


def test_factory_requires_a_key_and_uses_the_default_model(settings: Settings) -> None:
    without_key = settings.model_copy(update={"AI_PROVIDER": "gemini", "AI_API_KEY": None})
    assert get_provider(without_key) is None

    with_key = Settings.model_validate(
        {**settings.model_dump(), "AI_PROVIDER": "gemini", "AI_API_KEY": "abc"}
    )
    provider = get_provider(with_key)
    assert isinstance(provider, GeminiProvider)
    assert provider.model == DEFAULT_GEMINI_MODEL
    assert provider.backup_model == GEMINI_BACKUP_MODEL


# --- Modelo de apoio ------------------------------------------------------------------


@pytest.fixture(autouse=True)
def own_pool(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Pool próprio por teste: a chamada que perdeu a corrida termina dentro do teste."""
    pool = ThreadPoolExecutor(max_workers=2)
    monkeypatch.setattr(provider_module, "_GEMINI_POOL", pool)
    yield
    pool.shutdown(wait=True)


def make_raced_provider(primary: Any, backup: Any) -> tuple[GeminiProvider, list[str]]:
    """Principal e apoio com respostas próprias; registra qual modelo foi chamado."""
    called: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        model = request.url.path.rsplit("/", 1)[-1].split(":")[0]
        called.append(model)
        return primary() if model == "principal" else backup()

    provider = GeminiProvider(
        api_key="k",
        model="principal",
        backup_model="apoio",
        hedge_after_seconds=0.05,
        transport=httpx.MockTransport(handler),
    )
    return provider, called


def ok(text: str) -> Any:
    return lambda: httpx.Response(200, json=gemini_response(text))


def test_fast_primary_does_not_call_the_backup() -> None:
    provider, called = make_raced_provider(ok("principal"), ok("apoio"))

    result = provider.complete(system="s", user_content="u", max_tokens=10, effort="low")

    assert result.text == "principal"
    assert called == ["principal"]


def test_slow_primary_is_raced_against_the_backup() -> None:
    def slow() -> httpx.Response:
        time.sleep(1)
        return httpx.Response(200, json=gemini_response("principal"))

    provider, called = make_raced_provider(slow, ok("apoio"))

    result = provider.complete(system="s", user_content="u", max_tokens=10, effort="low")

    # Vale a primeira resposta: a pessoa não espera o modelo congestionado.
    assert result.text == "apoio"
    assert sorted(called) == ["apoio", "principal"]
    assert result.latency_ms < 1000


def test_failing_primary_goes_straight_to_the_backup() -> None:
    provider, called = make_raced_provider(lambda: httpx.Response(503), ok("apoio"))

    result = provider.complete(system="s", user_content="u", max_tokens=10, effort="low")

    assert result.text == "apoio"
    # Sem nova tentativa no principal: o apoio já é a segunda chance.
    assert called == ["principal", "apoio"]


def test_error_when_primary_and_backup_fail() -> None:
    provider, called = make_raced_provider(
        lambda: httpx.Response(503), lambda: httpx.Response(429, json={})
    )

    # O erro segue para o reserva (IA local) pelo FallbackProvider.
    with pytest.raises(AIProviderError):
        provider.complete(system="s", user_content="u", max_tokens=10, effort="low")
    assert called == ["principal", "apoio"]


def test_refusal_does_not_go_to_the_backup() -> None:
    refused = lambda: httpx.Response(  # noqa: E731
        200, json={"promptFeedback": {"blockReason": "SAFETY"}}
    )
    provider, called = make_raced_provider(refused, ok("apoio"))

    with pytest.raises(AIRefusalError):
        provider.complete(system="s", user_content="u", max_tokens=10, effort="low")
    assert called == ["principal"]
