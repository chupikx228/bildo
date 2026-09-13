from src.exceptions import DomainError


class GenerationError(DomainError):
    status_code = 502

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class GenerationNotConfiguredError(GenerationError):
    def __init__(self) -> None:
        super().__init__("Генерация недоступна: не задан ключ RouterAI")


class GenerationTimeoutError(GenerationError):
    def __init__(self, timeout_seconds: float, subject: str = "приложение") -> None:
        super().__init__(f"Модель не успела сгенерировать {subject} за {timeout_seconds:g} секунд")
