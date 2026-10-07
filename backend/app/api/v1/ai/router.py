"""Rotas de IA (§32). A IA sugere; nenhuma rota daqui altera dados de negócio."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.deps import CurrentUser, SessionDep
from app.schemas.ai import ClassifyRequest, ClassifyResponse
from app.services.ai.provider import LLMProvider
from app.services.ai.service import AIService

router = APIRouter(prefix="/ai", tags=["ai"])


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
