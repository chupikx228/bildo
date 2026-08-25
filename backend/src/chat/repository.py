from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.schemas import AppDocument
from src.chat.models import REPLY_UNIQUE_CONSTRAINT, ChatMessage
from src.chat.schemas import ChatMessageRole


def is_duplicate_reply_violation(error: IntegrityError) -> bool:
    driver_error = error.orig
    cause = driver_error.__cause__ if driver_error is not None else None
    return getattr(cause, "constraint_name", None) == REPLY_UNIQUE_CONSTRAINT


class ChatRepository(Protocol):
    async def list_messages(self, app_id: UUID) -> list[ChatMessage]: ...

    async def list_messages_up_to(self, app_id: UUID, message_id: UUID) -> list[ChatMessage]: ...

    async def get_message(self, message_id: UUID) -> ChatMessage | None: ...

    async def get_reply_to(self, message_id: UUID) -> ChatMessage | None: ...

    async def create_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
        in_reply_to_id: UUID | None = None,
    ) -> ChatMessage: ...

    async def record_decision(self, message: ChatMessage, accepted: bool) -> ChatMessage: ...


class SqlAlchemyChatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_messages(self, app_id: UUID) -> list[ChatMessage]:
        stmt = select(ChatMessage).where(ChatMessage.app_id == app_id).order_by(ChatMessage.sequence)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_messages_up_to(self, app_id: UUID, message_id: UUID) -> list[ChatMessage]:
        anchor = await self.get_message(message_id)
        if anchor is None or anchor.app_id != app_id:
            return []
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.app_id == app_id, ChatMessage.sequence <= anchor.sequence)
            .order_by(ChatMessage.sequence)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_message(self, message_id: UUID) -> ChatMessage | None:
        return await self._session.get(ChatMessage, message_id)

    async def get_reply_to(self, message_id: UUID) -> ChatMessage | None:
        stmt = select(ChatMessage).where(ChatMessage.in_reply_to_id == message_id)
        result = await self._session.execute(stmt)
        return result.scalars().first()

    async def create_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
        in_reply_to_id: UUID | None = None,
    ) -> ChatMessage:
        message = ChatMessage(
            app_id=app_id,
            role=role,
            content=content,
            proposed_document=(
                proposed_document.model_dump(mode="json", by_alias=True, exclude_none=True)
                if proposed_document is not None
                else None
            ),
            in_reply_to_id=in_reply_to_id,
        )
        self._session.add(message)
        await self._session.flush()
        return message

    async def record_decision(self, message: ChatMessage, accepted: bool) -> ChatMessage:
        message.accepted = accepted
        await self._session.flush()
        return message
