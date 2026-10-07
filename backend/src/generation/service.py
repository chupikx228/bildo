from datetime import UTC, datetime
from uuid import uuid4

from src.apps.navigation import leading_slash_routes, missing_roots
from src.apps.schemas import AppDocument, AppNode, NavigateAction
from src.generation.llm_client import LlmClient, enforces_response_schema
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

ROOT_NODE_TYPE = "View"


async def generate_document(
    prompt: str,
    name: str | None,
    *,
    client: LlmClient,
    model: str,
    max_attempts: int,
    brief: str | None = None,
) -> AppDocument:
    strict_schema = enforces_response_schema(model)
    document = await generate_structured(
        build_messages(brief or prompt, name, has_brief=bool(brief), strict_schema=strict_schema),
        client=client,
        model=model,
        schema_name=SCHEMA_NAME,
        schema=app_document_schema(strict=strict_schema),
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
            *_start_route_problems(document),
            *_empty_roots_problems(document),
            *_missing_roots_problems(document),
            *_leading_slash_route_problems(document),
            *_root_problems(document),
        ],
    )


def check_edited_document(document: AppDocument) -> None:
    _raise_on_problems(
        document,
        [
            *_dangling_navigate_problems(document),
            *_start_route_problems(document),
            *_empty_roots_problems(document),
            *_missing_roots_problems(document),
            *_leading_slash_route_problems(document),
            *_root_problems(document),
        ],
    )


def _raise_on_problems(document: AppDocument, problems: list[str]) -> None:
    if problems:
        screens = [f"`{screen.id}` (`route` `{screen.route}`)" for screen in document.screens]
        raise ValueError(
            f"Документ нарушает правила модели документа: {'; '.join(problems)}. "
            f"Экраны в документе — `id` и в скобках `route`: {', '.join(screens) or 'нет ни одного экрана'}"
        )


def _screen_count_problems(document: AppDocument) -> list[str]:
    count = len(document.screens)
    if count >= MIN_SCREENS:
        return []
    return [
        f"экранов в документе {count}, нужно от {MIN_SCREENS} до {MAX_SCREENS}: "
        "каждый экран содержательный — заголовок, основной контент и переход на другие экраны"
    ]


def _start_route_problems(document: AppDocument) -> list[str]:
    if START_ROUTE in [screen.route for screen in document.screens]:
        return []
    return [
        f"нет экрана, чей `route` равен `{START_ROUTE}`: `route` стартового экрана — буквально строка "
        f"`{START_ROUTE}`, смысловое название экрана пиши в `name`, `id` экрана не меняй"
    ]


def _empty_roots_problems(document: AppDocument) -> list[str]:
    if document.navigation.roots:
        return []
    return ["`navigation.roots` пуст: перечисли в нём `id` корневых экранов"]


def _missing_roots_problems(document: AppDocument) -> list[str]:
    missing = missing_roots(document)
    if not missing:
        return []
    return [
        f"`navigation.roots` ссылается на несуществующие `id` экранов: {', '.join(missing)}. "
        "`navigation.roots` перечисляет `id` экранов, их `route` туда не пишется"
    ]


def _leading_slash_route_problems(document: AppDocument) -> list[str]:
    slashed = leading_slash_routes(document)
    if not slashed:
        return []
    described = ", ".join(f"`{screen.id}` (`route` `{screen.route}`)" for screen in slashed)
    return [
        f"`route` экрана не может иметь ведущий `/`: {described}. "
        f"Стартовый экран — `{START_ROUTE}`, остальные пиши без ведущего слэша, например `progress`; "
        "при переименовании обнови все `navigate` и `href` на этот экран, `id` экрана не меняй"
    ]


def _dangling_navigate_problems(document: AppDocument) -> list[str]:
    routes = {screen.route for screen in document.screens}
    problems: list[str] = []
    for screen in document.screens:
        for node in _walk(screen.root):
            if node.props is None:
                continue
            for action in [*(node.props.on_press or []), *(node.props.on_change or [])]:
                if isinstance(action, NavigateAction) and action.route not in routes:
                    problems.append(
                        f"действие `navigate` узла `{node.id}` на экране `{screen.route}` ведёт на `{action.route}`, "
                        "среди экранов такого `route` нет: после переименования `route` экрана обнови все `navigate` "
                        "на него"
                    )
    return problems


def _walk(node: AppNode) -> list[AppNode]:
    nodes = [node]
    for child in node.children:
        nodes.extend(_walk(child))
    return nodes


def _root_problems(document: AppDocument) -> list[str]:
    expected = f"ровно 0, 0, {SCREEN_WIDTH}, {SCREEN_HEIGHT}"
    problems: list[str] = []
    for screen in document.screens:
        if screen.root.type != ROOT_NODE_TYPE:
            problems.append(
                f"корень экрана `{screen.route}` — `{screen.root.type}`, нужен `{ROOT_NODE_TYPE}`: корень каждого "
                f"экрана — контейнер `{ROOT_NODE_TYPE}`, остальные узлы вкладывай в него"
            )
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
