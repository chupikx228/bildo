from uuid import UUID

from src.apps.schemas import AppDocument
from src.exceptions import ConflictError, DomainError, NotFoundError


class AppNotFound(NotFoundError):  # noqa: N818
    def __init__(self, app_id: UUID) -> None:
        self.message = "Приложение не найдено"
        super().__init__(str(app_id))


class AppGenerationInProgress(ConflictError):  # noqa: N818
    def __init__(self, app_id: UUID) -> None:
        self.message = "Приложение ещё генерируется, сохранение недоступно"
        super().__init__(str(app_id))


class StaleRevisionError(DomainError):
    status_code = 412

    def __init__(self, app_id: UUID) -> None:
        self.message = "Документ устарел: приложение изменено, обновите документ перед сохранением"
        super().__init__(str(app_id))


class InvalidModel(DomainError):  # noqa: N818
    status_code = 422

    def __init__(self, model: str) -> None:
        self.message = f"Модель «{model}» недоступна"
        super().__init__(model)


class InvalidNavigationRootsError(DomainError):
    status_code = 422

    def __init__(self, missing: list[str], document: AppDocument) -> None:
        screens = ", ".join(f"«{screen.id}» (route «{screen.route}»)" for screen in document.screens)
        self.message = (
            f"navigation.roots ссылается на несуществующие id экранов: {', '.join(f'«{m}»' for m in missing)}. "
            f"Экраны в документе: {screens or 'нет ни одного экрана'}"
        )
        super().__init__(", ".join(missing))
