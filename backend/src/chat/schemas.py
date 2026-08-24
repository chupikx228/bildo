from typing import Literal

from src.apps.schemas import AppDocument, CamelModel

ChatMessageRole = Literal["user", "assistant"]


class ChatMessage(CamelModel):
    id: str
    role: ChatMessageRole
    content: str
    proposed_document: AppDocument | None = None
    accepted: bool | None = None
    created_at: str


class ChatMessageListResponse(CamelModel):
    messages: list[ChatMessage]


class DecisionRequest(CamelModel):
    accepted: bool
