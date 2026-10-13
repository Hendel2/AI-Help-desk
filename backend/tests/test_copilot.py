"""AI Copilot do técnico (§30, §44)."""

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.ai.router import get_ai_provider
from app.models import AIAction, Company, Ticket, User
from app.models.enums import AIActionType, RoleName
from app.services.ai.provider import AIProviderError, LLMResult

VPN_ARTICLE = {
    "title": "Falha de autenticação na VPN",
    "content": (
        "Quando a VPN mostrar falha de autenticação, confirme se a sua senha de rede não "
        "expirou, atualize o cliente VPN e reinicie o computador."
    ),
    "status": "PUBLISHED",
}
SECRET_NOTE = "Nota interna: servidor VPN-02 em manutenção não anunciada"


class FakeProvider:
    name = "fake"
    model = "fake-model"

    def __init__(self, response: str | Exception) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def complete(self, **kwargs: Any) -> LLMResult:
        self.calls.append(kwargs)
        if isinstance(self.response, Exception):
            raise self.response
        return LLMResult(
            text=self.response, model=self.model, input_tokens=80, output_tokens=40, latency_ms=7
        )


@pytest.fixture
def company(make_company: Callable[..., Company]) -> Company:
    return make_company(name="Empresa Alfa")


@pytest.fixture
def people(
    company: Company,
    make_company: Callable[..., Company],
    make_user: Callable[..., User],
    db_session: Session,
) -> dict[str, User]:
    other = make_company(name="Empresa Beta")
    users = {
        "ana": make_user(company, role=RoleName.USER, name="Ana Souza"),
        "tom": make_user(company, role=RoleName.TECHNICIAN, name="Tom"),
        "alice": make_user(company, role=RoleName.ADMIN, name="Alice"),
        "outsider": make_user(other, role=RoleName.TECHNICIAN, name="Zé"),
    }
    db_session.commit()
    return users


@pytest.fixture
def ticket(
    people: dict[str, User],
    make_ticket: Callable[..., Ticket],
    client: TestClient,
    auth_headers: Callable[[User], dict[str, str]],
    db_session: Session,
) -> Ticket:
    created = make_ticket(people["ana"], title="VPN com falha de autenticação")
    db_session.commit()
    response = client.post(
        f"/api/v1/tickets/{created.id}/comments",
        json={"content": SECRET_NOTE, "is_internal": True},
        headers=auth_headers(people["tom"]),
    )
    assert response.status_code == 201
    return created


@pytest.fixture
def vpn_article(
    client: TestClient, people: dict[str, User], auth_headers: Callable[[User], dict[str, str]]
) -> dict[str, Any]:
    response = client.post(
        "/api/v1/knowledge", json=VPN_ARTICLE, headers=auth_headers(people["alice"])
    )
    assert response.status_code == 201
    return response.json()


def _call(client: TestClient, path: str, ticket_id: int, headers: dict[str, str]) -> Any:
    return client.post(f"/api/v1/ai/{path}", json={"ticket_id": ticket_id}, headers=headers)


@pytest.mark.parametrize(
    "path", ["summarize", "suggest-solution", "generate-response", "analyze-history"]
)
def test_heuristic_actions_work_without_llm(
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    vpn_article: dict[str, Any],
    auth_headers: Callable[[User], dict[str, str]],
    path: str,
) -> None:
    response = _call(client, path, ticket.id, auth_headers(people["tom"]))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "heuristic"
    assert body["text"].strip()


def test_suggest_solution_cites_knowledge_base(
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    vpn_article: dict[str, Any],
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    body = _call(client, "suggest-solution", ticket.id, auth_headers(people["tom"])).json()

    assert body["sources"][0]["article_id"] == vpn_article["id"]
    assert "senha de rede" in body["text"]


def test_heuristic_response_greets_requester_and_hides_internal_notes(
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    body = _call(client, "generate-response", ticket.id, auth_headers(people["tom"])).json()

    assert body["text"].startswith("Olá, Ana!")
    assert "VPN-02" not in body["text"]


def test_find_articles_returns_related_published_articles(
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    vpn_article: dict[str, Any],
    auth_headers: Callable[[User], dict[str, str]],
    db_session: Session,
) -> None:
    response = _call(client, "find-articles", ticket.id, auth_headers(people["tom"]))

    assert response.status_code == 200
    assert [a["article_id"] for a in response.json()] == [vpn_article["id"]]
    log = db_session.scalars(
        select(AIAction).where(AIAction.action_type == AIActionType.RAG_SEARCH)
    ).one()
    assert log.input_reference == f"ticket:{ticket.id}"


def test_requester_cannot_use_copilot(
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    response = _call(client, "summarize", ticket.id, auth_headers(people["ana"]))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "COPILOT_FORBIDDEN"


def test_other_company_ticket_is_not_found(
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    response = _call(client, "summarize", ticket.id, auth_headers(people["outsider"]))

    assert response.status_code == 404


def test_llm_response_draft_never_receives_internal_comments(
    app: FastAPI,
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    vpn_article: dict[str, Any],
    auth_headers: Callable[[User], dict[str, str]],
    db_session: Session,
) -> None:
    provider = FakeProvider(
        json.dumps({"text": "Olá, Ana! Atualize o cliente VPN.", "used_source_ids": [999]})
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    body = _call(client, "generate-response", ticket.id, auth_headers(people["tom"])).json()

    assert body == {
        "action": "generate_response",
        "text": "Olá, Ana! Atualize o cliente VPN.",
        "sources": [],  # fonte inventada (999) descartada
        "mode": "llm",
    }
    prompt = provider.calls[0]["user_content"]
    assert SECRET_NOTE not in prompt
    assert VPN_ARTICLE["content"] in prompt
    log = db_session.scalars(
        select(AIAction).where(AIAction.action_type == AIActionType.GENERATE_RESPONSE)
    ).one()
    assert (log.model, log.input_tokens, log.success) == ("fake-model", 80, True)
    assert "VPN" not in (log.output or "")  # o log não guarda o texto gerado


def test_llm_summary_includes_internal_comments_for_staff(
    app: FastAPI,
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    auth_headers: Callable[[User], dict[str, str]],
) -> None:
    provider = FakeProvider(json.dumps({"text": "Resumo.", "used_source_ids": []}))
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = _call(client, "summarize", ticket.id, auth_headers(people["tom"]))

    assert response.json()["text"] == "Resumo."
    assert SECRET_NOTE in provider.calls[0]["user_content"]


@pytest.mark.parametrize("failure", [AIProviderError("timeout"), "não é json"])
def test_llm_failure_falls_back_to_heuristic(
    app: FastAPI,
    client: TestClient,
    people: dict[str, User],
    ticket: Ticket,
    auth_headers: Callable[[User], dict[str, str]],
    db_session: Session,
    failure: str | Exception,
) -> None:
    app.dependency_overrides[get_ai_provider] = lambda: FakeProvider(failure)

    response = _call(client, "analyze-history", ticket.id, auth_headers(people["tom"]))

    assert response.status_code == 200
    assert response.json()["mode"] == "heuristic"
    logs = db_session.scalars(select(AIAction).order_by(AIAction.id)).all()
    assert [log.success for log in logs] == [False, True]
