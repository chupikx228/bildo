from uuid import UUID

from src.exceptions import NotFoundError


class AppNotFound(NotFoundError):  # noqa: N818
    def __init__(self, app_id: UUID) -> None:
        self.message = "Приложение не найдено"
        super().__init__(str(app_id))
