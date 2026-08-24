from uuid import UUID

from fastapi import APIRouter, status

from src.apps.schemas import AppDocument
from src.chat.dependencies import ChatServiceDep
from src.chat.models import ChatMessage as ChatMessageRecord
from src.chat.schemas import (
    ChatMessage,
    ChatMessageListResponse,
    DecisionRequest,
    SendMessageRequest,
    SendMessageResponse,
)

router = APIRouter(prefix="/api/apps/{app_id}/chat", tags=["chat"])


@router.get("/messages", response_model=ChatMessageListResponse)
async def list_messages(app_id: UUID, service: ChatServiceDep) -> ChatMessageListResponse:
    messages = await service.list_messages(app_id)
    return ChatMessageListResponse(messages=[_to_schema(message) for message in messages])


@router.post("/messages", status_code=status.HTTP_202_ACCEPTED, response_model=SendMessageResponse)
async def send_message(app_id: UUID, body: SendMessageRequest, service: ChatServiceDep) -> SendMessageResponse:
    task_id = await service.send_message(app_id, body.content)
    return SendMessageResponse(task_id=task_id)


@router.post("/messages/{message_id}/decision")
async def decide_message(
    app_id: UUID,
    message_id: UUID,
    body: DecisionRequest,
    service: ChatServiceDep,
) -> dict[str, object]:
    message = await service.record_decision(app_id, message_id, body.accepted)
    return {"ok": True, "message": _to_schema(message)}


def _to_schema(message: ChatMessageRecord) -> ChatMessage:
    return ChatMessage(
        id=str(message.id),
        role=message.role,
        content=message.content,
        proposed_document=(
            AppDocument.model_validate(message.proposed_document) if message.proposed_document is not None else None
        ),
        accepted=message.accepted,
        created_at=message.created_at.isoformat(),
    )
