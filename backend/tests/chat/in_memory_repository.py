from datetime import UTC, datetime
from uuid import UUID, uuid4

from src.apps.schemas import AppDocument
from src.chat.models import ChatMessage
from src.chat.schemas import ChatMessageRole


class InMemoryChatRepository:
    def __init__(self) -> None:
        self._messages: dict[UUID, ChatMessage] = {}

    async def list_messages(self, app_id: UUID) -> list[ChatMessage]:
        return sorted(
            (message for message in self._messages.values() if message.app_id == app_id),
            key=lambda message: message.created_at,
        )

    async def get_message(self, message_id: UUID) -> ChatMessage | None:
        return self._messages.get(message_id)

    async def create_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
    ) -> ChatMessage:
        message = ChatMessage(
            id=uuid4(),
            app_id=app_id,
            role=role,
            content=content,
            proposed_document=(
                proposed_document.model_dump(mode="json", by_alias=True, exclude_none=True)
                if proposed_document is not None
                else None
            ),
            accepted=None,
            created_at=datetime.now(UTC),
        )
        self._messages[message.id] = message
        return message

    async def record_decision(self, message: ChatMessage, accepted: bool) -> ChatMessage:
        message.accepted = accepted
        return message
