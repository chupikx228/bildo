from datetime import UTC, datetime
from uuid import uuid4

from src.apps.schemas import AppDocument
from src.generation.llm_client import LlmClient
from src.generation.prompt import SCHEMA_NAME, START_ROUTE, app_document_schema, build_messages
from src.generation.structured_output import generate_structured


async def generate_document(
    prompt: str,
    name: str | None,
    *,
    client: LlmClient,
    model: str,
    max_attempts: int,
    brief: str | None = None,
) -> AppDocument:
    document = await generate_structured(
        build_messages(brief or prompt, name, has_brief=bool(brief)),
        client=client,
        model=model,
        schema_name=SCHEMA_NAME,
        schema=app_document_schema(),
        target_model=AppDocument,
        max_attempts=max_attempts,
        check=check_navigation,
    )
    return _finalize(document, prompt, name)


def check_navigation(document: AppDocument) -> None:
    routes = [screen.route for screen in document.screens]
    problems: list[str] = []
    if START_ROUTE not in routes:
        problems.append(
            f"нет экрана, чей `route` равен `{START_ROUTE}`: `id` и `route` стартового экрана — буквально строка "
            f"`{START_ROUTE}`, смысловое название экрана пиши в `name`"
        )
    roots = document.navigation.roots
    if not roots:
        problems.append("`navigation.roots` пуст: перечисли в нём `route` корневых экранов")
    missing = [root for root in roots if root not in routes]
    if missing:
        problems.append(f"`navigation.roots` ссылается на несуществующие `route`: {', '.join(missing)}")
    if problems:
        raise ValueError(
            f"Навигация документа некорректна: {'; '.join(problems)}. Маршруты экранов в документе: {', '.join(routes)}"
        )


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
