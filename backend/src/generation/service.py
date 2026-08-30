from datetime import UTC, datetime
from uuid import uuid4

from src.apps.schemas import AppDocument
from src.generation.llm_client import LlmClient
from src.generation.prompt import SCHEMA_NAME, app_document_schema, build_messages
from src.generation.structured_output import generate_structured


async def generate_document(
    prompt: str,
    name: str | None,
    *,
    client: LlmClient,
    model: str,
    max_attempts: int,
) -> AppDocument:
    document = await generate_structured(
        build_messages(prompt, name),
        client=client,
        model=model,
        schema_name=SCHEMA_NAME,
        schema=app_document_schema(),
        target_model=AppDocument,
        max_attempts=max_attempts,
    )
    return _finalize(document, prompt, name)


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
