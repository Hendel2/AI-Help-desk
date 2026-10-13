"""Rotas de IA (§32). A IA sugere; nenhuma rota daqui altera dados de negócio."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.deps import AILimit, CurrentUser, SessionDep, SettingsDep
from app.api.v1.admin.router import AdminDep
from app.models import User
from app.schemas.admin import AISettingsRead
from app.schemas.ai import (
    ClassifyRequest,
    ClassifyResponse,
    CopilotRequest,
    CopilotResponse,
    CopilotSource,
)
from app.services.ai.copilot import CopilotAction
from app.services.ai.copilot_service import CopilotService
from app.services.ai.provider import LLMProvider
from app.services.ai.rag import RAGService
from app.services.ai.service import AIService

# Toda rota de IA tem custo: limite por usuário.
router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[AILimit])


def get_ai_provider(request: Request) -> LLMProvider | None:
    """Provedor criado uma vez em `create_app` (reaproveita conexões HTTP)."""
    return getattr(request.app.state, "ai_provider", None)


def get_ai_service(
    session: SessionDep, provider: Annotated[LLMProvider | None, Depends(get_ai_provider)]
) -> AIService:
    return AIService(session, provider)


ServiceDep = Annotated[AIService, Depends(get_ai_service)]


@router.post(
    "/classify",
    response_model=ClassifyResponse,
    summary="Sugere intenção, categoria e prioridade para um chamado",
)
def classify(data: ClassifyRequest, user: CurrentUser, service: ServiceDep) -> ClassifyResponse:
    result = service.classify(user, data.text)
    classification = result.classification
    return ClassifyResponse(
        intent=classification.intent,
        category_id=result.category.id if result.category else None,
        category_name=classification.category_name,
        priority=classification.priority,
        confidence=classification.confidence,
        source=classification.source,
    )


# --- AI Copilot (§30, §44) — somente equipe de suporte ----------------------


def get_copilot_service(
    session: SessionDep,
    provider: Annotated[LLMProvider | None, Depends(get_ai_provider)],
    request: Request,
) -> CopilotService:
    state = request.app.state
    return CopilotService(
        session, provider, RAGService(session, state.vector_store, state.embedder)
    )


CopilotDep = Annotated[CopilotService, Depends(get_copilot_service)]


def _copilot(
    action: CopilotAction, data: CopilotRequest, user: User, service: CopilotService
) -> CopilotResponse:
    result = service.run(user, data.ticket_id, action)
    return CopilotResponse(
        action=action,
        text=result.text,
        sources=[CopilotSource(article_id=s.article_id, title=s.title) for s in result.sources],
        mode=result.mode,
    )


@router.post("/summarize", response_model=CopilotResponse, summary="Copilot: resumir chamado")
def summarize(data: CopilotRequest, user: CurrentUser, service: CopilotDep) -> CopilotResponse:
    return _copilot("summarize", data, user, service)


@router.post(
    "/suggest-solution", response_model=CopilotResponse, summary="Copilot: sugerir solução"
)
def suggest_solution(
    data: CopilotRequest, user: CurrentUser, service: CopilotDep
) -> CopilotResponse:
    return _copilot("suggest_solution", data, user, service)


@router.post(
    "/generate-response",
    response_model=CopilotResponse,
    summary="Copilot: rascunho de resposta (o técnico revisa e envia)",
)
def generate_response(
    data: CopilotRequest, user: CurrentUser, service: CopilotDep
) -> CopilotResponse:
    return _copilot("generate_response", data, user, service)


@router.post(
    "/analyze-history", response_model=CopilotResponse, summary="Copilot: analisar histórico"
)
def analyze_history(
    data: CopilotRequest, user: CurrentUser, service: CopilotDep
) -> CopilotResponse:
    return _copilot("analyze_history", data, user, service)


@router.post(
    "/find-articles",
    response_model=list[CopilotSource],
    summary="Copilot: artigos relacionados ao chamado",
)
def find_articles(
    data: CopilotRequest, user: CurrentUser, service: CopilotDep
) -> list[CopilotSource]:
    return [
        CopilotSource(article_id=s.article_id, title=s.title, excerpt=s.excerpt)
        for s in service.find_articles(user, data.ticket_id)
    ]


@router.get(
    "/settings",
    response_model=AISettingsRead,
    summary="Configuração e uso da IA (somente leitura; definida no ambiente)",
)
def ai_settings(
    service: AdminDep,
    settings: SettingsDep,
    provider: Annotated[LLMProvider | None, Depends(get_ai_provider)],
) -> AISettingsRead:
    return service.ai_settings(settings, provider.model if provider else None)
