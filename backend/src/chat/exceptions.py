from uuid import UUID

from src.exceptions import ConflictError, NotFoundError


class ChatMessageNotFound(NotFoundError):  # noqa: N818
    def __init__(self, message_id: UUID) -> None:
        self.message = "Сообщение не найдено"
        super().__init__(str(message_id))


class MessageNotDecidable(ConflictError):  # noqa: N818
    def __init__(self, message_id: UUID) -> None:
        self.message = "Решение недоступно: сообщение не является предложением ассистента"
        super().__init__(str(message_id))


class ChatQueueNotConfiguredError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("ChatService собран без очереди задач: отправка сообщений недоступна")
