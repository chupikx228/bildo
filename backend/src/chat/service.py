from uuid import UUID, uuid4

from src.apps.exceptions import AppGenerationInProgress
from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.chat.exceptions import ChatMessageNotFound, ChatQueueNotConfiguredError, MessageNotDecidable
from src.chat.models import ChatMessage
from src.chat.repository import ChatRepository
from src.chat.schemas import ChatMessageRole
from src.queue.base import TaskQueue
from src.queue.jobs import CHAT_TURN_JOB
from src.transaction.base import Transaction

CONTEXT_HISTORY_LIMIT = 20


class ChatService:
    def __init__(
        self,
        repository: ChatRepository,
        app_service: AppService,
        transaction: Transaction,
        task_queue: TaskQueue | None = None,
    ) -> None:
        self._repository = repository
        self._app_service = app_service
        self._transaction = transaction
        self._task_queue = task_queue

    async def list_messages(self, app_id: UUID) -> list[ChatMessage]:
        await self._app_service.get_app(app_id)
        return await self._repository.list_messages(app_id)

    async def add_message(
        self,
        app_id: UUID,
        role: ChatMessageRole,
        content: str,
        proposed_document: AppDocument | None = None,
        in_reply_to_id: UUID | None = None,
    ) -> ChatMessage:
        await self._app_service.get_app(app_id)
        return await self._repository.create_message(app_id, role, content, proposed_document, in_reply_to_id)

    async def send_message(self, app_id: UUID, content: str) -> str:
        if self._task_queue is None:
            raise ChatQueueNotConfiguredError
        app = await self._app_service.get_app(app_id)
        if app.generation_status == "pending":
            raise AppGenerationInProgress(app_id)
        message = await self._repository.create_message(app_id, "user", content)
        await self._transaction.commit()
        task_id = str(uuid4())
        await self._task_queue.enqueue(CHAT_TURN_JOB, task_id, app_id=str(app_id), message_id=str(message.id))
        return task_id

    async def build_context(self, app_id: UUID, up_to_message_id: UUID) -> tuple[AppDocument, list[ChatMessage]]:
        app = await self._app_service.get_app(app_id)
        document = AppDocument.model_validate(app.document)
        history = await self._repository.list_messages_up_to(app_id, up_to_message_id)
        return document, history[-CONTEXT_HISTORY_LIMIT:]

    async def has_reply(self, message_id: UUID) -> bool:
        return await self._repository.get_reply_to(message_id) is not None

    async def record_decision(self, app_id: UUID, message_id: UUID, accepted: bool) -> ChatMessage:
        message = await self._repository.get_message(message_id)
        if message is None or message.app_id != app_id:
            raise ChatMessageNotFound(message_id)
        if message.role != "assistant" or message.proposed_document is None:
            raise MessageNotDecidable(message_id)
        return await self._repository.record_decision(message, accepted)
