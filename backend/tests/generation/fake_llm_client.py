from collections.abc import Sequence

from src.generation.llm_client import ChatMessage, JsonSchema


class FakeLlmClient:
    def __init__(self, answers: Sequence[str | Exception]) -> None:
        self._answers = list(answers)
        self.calls: list[list[ChatMessage]] = []
        self.schemas: list[JsonSchema] = []
        self.models: list[str] = []
        self.closed = False

    async def complete(
        self,
        messages: Sequence[ChatMessage],
        schema_name: str,
        schema: JsonSchema,
        *,
        model: str,
    ) -> str:
        self.calls.append(list(messages))
        self.schemas.append(schema)
        self.models.append(model)
        if not self._answers:
            raise AssertionError("Клиент вызван больше раз, чем подготовлено ответов")
        answer = self._answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    async def aclose(self) -> None:
        self.closed = True
