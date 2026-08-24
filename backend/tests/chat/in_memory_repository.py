from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError

from src.apps.schemas import AppDocument
from src.chat.models import REPLY_FOREIGN_KEY_CONSTRAINT, REPLY_UNIQUE_CONSTRAINT, ChatMessage
from src.chat.schemas import ChatMessageRole


class FakePostgresError(Exception):
    def __init__(self, constraint_name: str) -> None:
        super().__init__(f'violates constraint "{constraint_name}"')
        self.constraint_name = constraint_name


def integrity_error(constraint_name: str) -> IntegrityError:
    driver_error = Exception(f'violates constraint "{constraint_name}"')
    driver_error.__cause__ = FakePostgresError(constraint_name)
    return IntegrityError("insert", None, driver_error)


class InMemoryChatRepository:
    def __init__(self) -> None:
        self._messages: list[ChatMessage] = []
        self._sequence = 0

    async def list_messages(self, app_id: UUID) -> list[ChatMessage]:
        selected = [message for message in self._messages if message.app_id == app_id]
        return sorted(selected, key=lambda message: message.sequence)

    async def list_messages_up_to(self, app_id: UUID, message_id: UUID) -> list[ChatMessage]:
        anchor = await self.get_message(message_id)
        if anchor is None or anchor.app_id != app_id:
            return []
        history = await self.list_messages(app_id)
        return [message for message in history if message.sequence <= anchor.sequence]

    async def get_message(self, message_id: UUID) -> ChatMessage | None:
        return next((message for message in self._messages if message.id == message_id), None)

    async def get_reply_to(self, message_id: UUID) -> ChatMessage | None:
        return next((message for message in self._messages if message.in_reply_to_id == message_id), None)

    async def create_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
        in_reply_to_id: UUID | None = None,
    ) -> ChatMessage:
        if in_reply_to_id is not None:
            anchor = await self.get_message(in_reply_to_id)
            if anchor is None or anchor.app_id != app_id:
                raise integrity_error(REPLY_FOREIGN_KEY_CONSTRAINT)
            if await self.get_reply_to(in_reply_to_id) is not None:
                raise integrity_error(REPLY_UNIQUE_CONSTRAINT)
        self._sequence += 1
        message = ChatMessage(
            id=uuid4(),
            sequence=self._sequence,
            app_id=app_id,
            role=role,
            content=content,
            proposed_document=(
                proposed_document.model_dump(mode="json", by_alias=True, exclude_none=True)
                if proposed_document is not None
                else None
            ),
            accepted=None,
            in_reply_to_id=in_reply_to_id,
            created_at=datetime.now(UTC),
        )
        self._messages.append(message)
        return message

    async def record_decision(self, message: ChatMessage, accepted: bool) -> ChatMessage:
        message.accepted = accepted
        return message
