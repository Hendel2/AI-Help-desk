"""Rotas do Assistente de TI (§32)."""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import AILimit, CurrentUser, SessionDep
from app.api.v1.ai.router import get_ai_provider
from app.api.v1.knowledge.router import get_rag
from app.schemas.chat import (
    ChatTurnRead,
    ConversationRead,
    ConversationSummary,
    EscalationRead,
    FeedbackCreate,
    MessageRead,
    SendMessage,
)
from app.schemas.common import ErrorResponse
from app.services.ai.provider import LLMProvider
from app.services.ai.rag import RAGService
from app.services.chat import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])

NOT_FOUND = {404: {"model": ErrorResponse, "description": "Conversa não encontrada"}}


def get_chat_service(
    session: SessionDep,
    provider: Annotated[LLMProvider | None, Depends(get_ai_provider)],
    rag: Annotated[RAGService, Depends(get_rag)],
) -> ChatService:
    return ChatService(session, provider, rag)


ServiceDep = Annotated[ChatService, Depends(get_chat_service)]


@router.post(
    "/conversations",
    response_model=ConversationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Inicia uma conversa com o Assistente de TI",
)
def create_conversation(user: CurrentUser, service: ServiceDep) -> ConversationRead:
    return ConversationRead.model_validate(service.create(user))


@router.get("/conversations", response_model=list[ConversationSummary], summary="Minhas conversas")
def list_conversations(user: CurrentUser, service: ServiceDep) -> list[ConversationSummary]:
    return [ConversationSummary.model_validate(c) for c in service.list(user)]


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationRead,
    responses=NOT_FOUND,
    summary="Conversa com o histórico de mensagens",
)
def get_conversation(
    conversation_id: int, user: CurrentUser, service: ServiceDep
) -> ConversationRead:
    return ConversationRead.model_validate(service.get(user, conversation_id))


@router.post(
    "/conversations/{conversation_id}/messages",
    dependencies=[AILimit],
    response_model=ChatTurnRead,
    responses=NOT_FOUND,
    summary="Envia uma mensagem e recebe a resposta do assistente",
)
def send_message(
    conversation_id: int, data: SendMessage, user: CurrentUser, service: ServiceDep
) -> ChatTurnRead:
    turn = service.send(user, conversation_id, data.content)
    return ChatTurnRead(
        user_message=MessageRead.model_validate(turn.user_message),
        assistant_message=MessageRead.model_validate(turn.assistant_message),
    )


@router.post(
    "/conversations/{conversation_id}/escalate",
    response_model=EscalationRead,
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
    summary="Abre um chamado a partir da conversa",
)
def escalate(conversation_id: int, user: CurrentUser, service: ServiceDep) -> EscalationRead:
    ticket = service.escalate(user, conversation_id)
    return EscalationRead(ticket_id=ticket.id, ticket_number=ticket.ticket_number)


@router.post(
    "/conversations/{conversation_id}/resolve",
    response_model=ConversationRead,
    responses=NOT_FOUND,
    summary="Marca a conversa como resolvida",
)
def resolve(conversation_id: int, user: CurrentUser, service: ServiceDep) -> ConversationRead:
    return ConversationRead.model_validate(service.resolve(user, conversation_id))


@router.post(
    "/messages/{message_id}/feedback",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
    summary="Avalia uma resposta do assistente (👍/👎)",
)
def message_feedback(
    message_id: int, data: FeedbackCreate, user: CurrentUser, service: ServiceDep
) -> None:
    service.feedback(user, message_id, data.rating, data.feedback_text)
