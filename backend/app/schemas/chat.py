"""Schemas do Assistente de TI (chat)."""

from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, StringConstraints

from app.models.enums import AIFeedbackRating, ChatIntent, ConversationStatus, MessageRole
from app.schemas.common import ORMModel

ChatText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class MessageRead(ORMModel):
    id: int
    role: MessageRole
    content: str
    intent: ChatIntent | None
    sources: list[dict[str, Any]] | None
    suggest_ticket: bool
    created_at: datetime


class ConversationSummary(ORMModel):
    id: int
    title: str | None
    status: ConversationStatus
    ticket_id: int | None
    created_at: datetime
    updated_at: datetime


class ConversationRead(ConversationSummary):
    messages: list[MessageRead]


class SendMessage(BaseModel):
    content: ChatText


class ChatTurnRead(BaseModel):
    user_message: MessageRead
    assistant_message: MessageRead


class EscalationRead(BaseModel):
    ticket_id: int
    ticket_number: str


class FeedbackCreate(BaseModel):
    rating: AIFeedbackRating
    feedback_text: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None
    ) = None
