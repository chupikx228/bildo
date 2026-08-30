import json
import logging
from collections.abc import Sequence

from pydantic import BaseModel, ValidationError

from src.generation.exceptions import GenerationError
from src.generation.llm_client import ChatMessage, JsonSchema, LlmClient

logger = logging.getLogger(__name__)

MAX_ERROR_CHARS = 2000

JSON_FENCE = "```"


async def generate_structured[ModelT: BaseModel](
    messages: Sequence[ChatMessage],
    *,
    client: LlmClient,
    model: str,
    schema_name: str,
    schema: JsonSchema,
    target_model: type[ModelT],
    max_attempts: int,
    subject: str = "документ",
) -> ModelT:
    history = list(messages)
    last_error = ""

    for attempt in range(1, max_attempts + 1):
        raw = await client.complete(history, schema_name, schema, model=model)
        try:
            return _parse(raw, target_model)
        except (ValueError, ValidationError) as error:
            last_error = _describe(error)
            logger.warning(
                "RouterAI returned an invalid %s on attempt %s/%s: %s",
                schema_name,
                attempt,
                max_attempts,
                last_error,
            )
            history = [*history, *_build_retry_messages(raw, last_error)]

    raise GenerationError(f"Модель RouterAI не вернула корректный {subject} за {max_attempts} попыток: {last_error}")


def _parse[ModelT: BaseModel](raw: str, target_model: type[ModelT]) -> ModelT:
    return target_model.model_validate(json.loads(_extract_json(raw)))


def _extract_json(raw: str) -> str:
    text = raw.strip()
    if text.startswith(JSON_FENCE):
        text = text.removeprefix(JSON_FENCE).removeprefix("json").strip().removesuffix(JSON_FENCE).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("Ответ модели не содержит JSON-объекта")
    return text[start : end + 1]


def _describe(error: Exception) -> str:
    return str(error)[:MAX_ERROR_CHARS]


def _build_retry_messages(raw_answer: str, error: str) -> list[ChatMessage]:
    return [
        ChatMessage(role="assistant", content=raw_answer),
        ChatMessage(
            role="user",
            content=(
                "Этот ответ не прошёл валидацию:\n"
                f"{error}\n\n"
                "Исправь перечисленные ошибки и верни ответ снова целиком одним JSON-объектом, строго по схеме."
            ),
        ),
    ]
