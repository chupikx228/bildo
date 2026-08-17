import json
import logging
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import ValidationError

from src.apps.schemas import AppDocument
from src.generation.exceptions import GenerationError
from src.generation.llm_client import LlmClient
from src.generation.prompt import SCHEMA_NAME, app_document_schema, build_messages, build_retry_messages

logger = logging.getLogger(__name__)

MAX_ERROR_CHARS = 2000

JSON_FENCE = "```"


async def generate_document(prompt: str, name: str | None, *, client: LlmClient, max_attempts: int) -> AppDocument:
    messages = build_messages(prompt, name)
    schema = app_document_schema()
    last_error = ""

    for attempt in range(1, max_attempts + 1):
        raw = await client.complete(messages, SCHEMA_NAME, schema)
        try:
            document = _parse_document(raw)
        except (ValueError, ValidationError) as error:
            last_error = _describe(error)
            logger.warning(
                "RouterAI returned an invalid document on attempt %s/%s: %s", attempt, max_attempts, last_error
            )
            messages = [*messages, *build_retry_messages(raw, last_error)]
            continue
        return _finalize(document, prompt, name)

    raise GenerationError(f"Модель RouterAI не вернула корректный документ за {max_attempts} попыток: {last_error}")


def _parse_document(raw: str) -> AppDocument:
    return AppDocument.model_validate(json.loads(_extract_json(raw)))


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


def _finalize(document: AppDocument, prompt: str, name: str | None) -> AppDocument:
    now = datetime.now(UTC).isoformat()
    return document.model_copy(
        update={
            "id": str(uuid4()),
            "name": name or document.name,
            "prompt": prompt,
            "created_at": now,
            "updated_at": now,
        }
    )
