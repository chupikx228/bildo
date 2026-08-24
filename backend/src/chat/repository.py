from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.schemas import AppDocument
from src.chat.models import ChatMessage
from src.chat.schemas import ChatMessageRole


class ChatRepository(Protocol):
    async def list_messages(self, app_id: UUID) -> list[ChatMessage]: ...

    async def get_message(self, message_id: UUID) -> ChatMessage | None: ...

    async def create_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
    ) -> ChatMessage: ...

    async def record_decision(self, message: ChatMessage, accepted: bool) -> ChatMessage: ...


class SqlAlchemyChatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_messages(self, app_id: UUID) -> list[ChatMessage]:
        stmt = select(ChatMessage).where(ChatMessage.app_id == app_id).order_by(ChatMessage.created_at)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_message(self, message_id: UUID) -> ChatMessage | None:
        return await self._session.get(ChatMessage, message_id)

    async def create_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
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
        )
        self._session.add(message)
        await self._session.flush()
        return message

    async def record_decision(self, message: ChatMessage, accepted: bool) -> ChatMessage:
        message.accepted = accepted
        await self._session.flush()
        return message
