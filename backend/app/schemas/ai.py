"""Schemas dos endpoints de IA."""

from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.models.enums import ChatIntent, TicketPriority

AIInputText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=5000)
]


class ClassifyRequest(BaseModel):
    text: AIInputText


class ClassifyResponse(BaseModel):
    """Sugestão da IA (§47): o usuário pode alterar antes de abrir o chamado."""

    intent: ChatIntent
    category_id: int | None
    category_name: str | None
    priority: TicketPriority
    confidence: float
    source: Literal["llm", "heuristic"]


class CopilotRequest(BaseModel):
    ticket_id: int


class CopilotSource(BaseModel):
    article_id: int
    title: str
    excerpt: str | None = None


class CopilotResponse(BaseModel):
    """Sugestão do Copilot: texto editável, nunca enviado automaticamente (§30)."""

    action: str
    text: str
    sources: list[CopilotSource]
    mode: Literal["llm", "heuristic"]
