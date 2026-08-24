from uuid import UUID

from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.chat.exceptions import ChatMessageNotFound, MessageNotDecidable
from src.chat.models import ChatMessage
from src.chat.repository import ChatRepository
from src.chat.schemas import ChatMessageRole


class ChatService:
    def __init__(self, repository: ChatRepository, app_service: AppService) -> None:
        self._repository = repository
        self._app_service = app_service

    async def list_messages(self, app_id: UUID) -> list[ChatMessage]:
        await self._app_service.get_app(app_id)
        return await self._repository.list_messages(app_id)

    async def add_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
    ) -> ChatMessage:
        await self._app_service.get_app(app_id)
        return await self._repository.create_message(app_id, role, content, proposed_document)

    async def record_decision(self, message_id: UUID, accepted: bool) -> ChatMessage:
        message = await self._repository.get_message(message_id)
        if message is None:
            raise ChatMessageNotFound(message_id)
        if message.role != "assistant" or message.proposed_document is None:
            raise MessageNotDecidable(message_id)
        return await self._repository.record_decision(message, accepted)
