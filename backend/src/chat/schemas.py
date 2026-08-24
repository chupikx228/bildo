from typing import Annotated, Literal

from pydantic import Field, field_validator

from src.apps.schemas import AppDocument, CamelModel

ChatMessageRole = Literal["user", "assistant"]

MIN_MESSAGE_LENGTH = 3
MAX_MESSAGE_LENGTH = 4000


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


class ChatTurnResponse(CamelModel):
    reply: Annotated[str, Field(min_length=1)]
    document: AppDocument | None = None

    @field_validator("reply", mode="before")
    @classmethod
    def strip_reply(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class SendMessageRequest(CamelModel):
    content: Annotated[str, Field(min_length=MIN_MESSAGE_LENGTH, max_length=MAX_MESSAGE_LENGTH)]

    @field_validator("content", mode="before")
    @classmethod
    def strip_content(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class SendMessageResponse(CamelModel):
    task_id: str
