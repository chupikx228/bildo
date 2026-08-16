from uuid import UUID

from src.exceptions import ConflictError, NotFoundError


class AppNotFound(NotFoundError):  # noqa: N818
    def __init__(self, app_id: UUID) -> None:
        self.message = "Приложение не найдено"
        super().__init__(str(app_id))


class AppGenerationInProgress(ConflictError):  # noqa: N818
    def __init__(self, app_id: UUID) -> None:
        self.message = "Приложение ещё генерируется, сохранение недоступно"
        super().__init__(str(app_id))
