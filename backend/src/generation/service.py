from datetime import UTC, datetime
from uuid import uuid4

from src.apps.schemas import AppDocument
from src.generation.llm_client import LlmClient
from src.generation.prompt import (
    MAX_SCREENS,
    MIN_SCREENS,
    SCHEMA_NAME,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    START_ROUTE,
    app_document_schema,
    build_messages,
)
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
        check=check_document,
    )
    return _finalize(document, prompt, name)


def check_document(document: AppDocument) -> None:
    _raise_on_problems(
        document,
        [
            *_screen_count_problems(document),
            *_start_route_problems(document, "`id` и `route`"),
            *_empty_roots_problems(document),
            *_missing_roots_problems(document),
            *_root_layout_problems(document),
        ],
    )


def check_edited_document(document: AppDocument) -> None:
    _raise_on_problems(
        document,
        [
            *_start_route_problems(document, "`route`"),
            *_empty_roots_problems(document),
            *_root_layout_problems(document),
        ],
    )


def _raise_on_problems(document: AppDocument, problems: list[str]) -> None:
    if problems:
        routes = [screen.route for screen in document.screens]
        raise ValueError(
            f"Документ нарушает правила модели документа: {'; '.join(problems)}. "
            f"Маршруты экранов в документе: {', '.join(routes) or 'нет ни одного экрана'}"
        )


def _screen_count_problems(document: AppDocument) -> list[str]:
    count = len(document.screens)
    if count >= MIN_SCREENS:
        return []
    return [
        f"экранов в документе {count}, нужно от {MIN_SCREENS} до {MAX_SCREENS}: "
        "каждый экран содержательный — заголовок, основной контент и переход на другие экраны"
    ]


def _start_route_problems(document: AppDocument, start_screen_fields: str) -> list[str]:
    if START_ROUTE in [screen.route for screen in document.screens]:
        return []
    return [
        f"нет экрана, чей `route` равен `{START_ROUTE}`: {start_screen_fields} стартового экрана — буквально строка "
        f"`{START_ROUTE}`, смысловое название экрана пиши в `name`"
    ]


def _empty_roots_problems(document: AppDocument) -> list[str]:
    if document.navigation.roots:
        return []
    return ["`navigation.roots` пуст: перечисли в нём `route` корневых экранов"]


def _missing_roots_problems(document: AppDocument) -> list[str]:
    routes = [screen.route for screen in document.screens]
    missing = [root for root in document.navigation.roots if root not in routes]
    if not missing:
        return []
    return [f"`navigation.roots` ссылается на несуществующие `route`: {', '.join(missing)}"]


def _root_layout_problems(document: AppDocument) -> list[str]:
    expected = f"ровно 0, 0, {SCREEN_WIDTH}, {SCREEN_HEIGHT}"
    problems: list[str] = []
    for screen in document.screens:
        layout = screen.root.layout
        if layout is None:
            problems.append(f"корень экрана `{screen.route}` без `layout`, нужен `layout` {expected}")
        elif (layout.x, layout.y, layout.width, layout.height) != (0, 0, SCREEN_WIDTH, SCREEN_HEIGHT):
            actual = ", ".join(f"{value:g}" for value in (layout.x, layout.y, layout.width, layout.height))
            problems.append(
                f"`layout` корня экрана `{screen.route}` — {actual}, нужен {expected}: корень каждого экрана "
                f"занимает всю сцену {SCREEN_WIDTH} x {SCREEN_HEIGHT}, вложенные узлы располагай внутри него"
            )
    return problems


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
