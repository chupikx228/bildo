from src.exceptions import DomainError


class ExportTimeout(DomainError):  # noqa: N818
    status_code = 504
    message = "Сборка проекта заняла слишком много времени, попробуйте ещё раз"
