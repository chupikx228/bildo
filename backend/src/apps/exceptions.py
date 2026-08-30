from uuid import UUID

from src.exceptions import ConflictError, DomainError, NotFoundError


class AppNotFound(NotFoundError):  # noqa: N818
    def __init__(self, app_id: UUID) -> None:
        self.message = "Приложение не найдено"
        super().__init__(str(app_id))


class AppGenerationInProgress(ConflictError):  # noqa: N818
    def __init__(self, app_id: UUID) -> None:
        self.message = "Приложение ещё генерируется, сохранение недоступно"
        super().__init__(str(app_id))


class StaleRevision(DomainError):  # noqa: N818
    status_code = 412

    def __init__(self, app_id: UUID) -> None:
        self.message = "Документ устарел: приложение изменено, обновите документ перед сохранением"
        super().__init__(str(app_id))


class InvalidModel(DomainError):  # noqa: N818
    status_code = 422

    def __init__(self, model: str) -> None:
        self.message = f"Модель «{model}» недоступна"
        super().__init__(model)
