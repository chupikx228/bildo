import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from src.apps.schemas import AppDocument, AppNode, NavigateAction
from src.codegen.service import generate_files
from tests.codegen.max_coverage_document import THEME
from tests.conftest import migration_database, requires_docker, upgrade_to

pytestmark = [pytest.mark.integration, requires_docker]

REVISION_BEFORE_BARE_ROUTES = "ecaed9c13144"
REVISION_WITH_BARE_ROUTES = "058c6029761a"

MIGRATION_DATABASE = "apps_leading_slash_routes_migration"

INSERT_APP = "INSERT INTO apps (id, name, document) VALUES (:id, :name, CAST(:document AS jsonb))"
INSERT_MESSAGE = """
    INSERT INTO chat_messages (id, app_id, role, content, proposed_document, accepted)
    VALUES (:id, :app_id, :role, :content, CAST(:proposed_document AS jsonb), :accepted)
"""
SELECT_APP = "SELECT document::text FROM apps WHERE id = :id"
SELECT_PROPOSED_DOCUMENT = "SELECT proposed_document::text FROM chat_messages WHERE id = :id"


def button(node_id: str, route: str, href: str | None = None) -> dict[str, Any]:
    props: dict[str, Any] = {"text": node_id, "onPress": [{"type": "navigate", "route": route}]}
    if href is not None:
        props["href"] = href
    return {"id": node_id, "type": "Button", "props": props}


def build_document(app_id: UUID, screens: list[tuple[str, str, list[dict[str, Any]]]]) -> str:
    payload: dict[str, Any] = {
        "id": str(app_id),
        "name": "Трекер привычек",
        "theme": THEME.model_dump(by_alias=True),
        "navigation": {"type": "tabs", "roots": [screen_id for screen_id, _, _ in screens]},
        "screens": [
            {
                "id": screen_id,
                "name": screen_id,
                "route": route,
                "root": {"id": f"root-{screen_id}", "type": "View", "children": children},
            }
            for screen_id, route, children in screens
        ],
        "state": {},
        "revision": 3,
        "createdAt": "2026-09-01T10:00:00+00:00",
        "updatedAt": "2026-09-01T10:00:00+00:00",
    }
    return json.dumps(payload, ensure_ascii=False)


def tracker(app_id: UUID) -> str:
    return build_document(
        app_id,
        [
            (
                "screen-today",
                "/",
                [
                    button("to-progress", "/progress", href="/progress"),
                    {
                        "id": "card",
                        "type": "View",
                        "children": [
                            button("nested-to-today", "/"),
                            {
                                "id": "site",
                                "type": "Button",
                                "props": {
                                    "text": "Сайт",
                                    "href": "https://example.com/progress",
                                    "onPress": [{"type": "openUrl", "url": "/progress"}],
                                },
                            },
                        ],
                    },
                ],
            ),
            ("screen-progress", "/progress", [button("to-today", "/")]),
            ("screen-settings", "settings", [button("settings-to-progress", "/progress")]),
        ],
    )


def find(node: AppNode, node_id: str) -> AppNode | None:
    if node.id == node_id:
        return node
    for child in node.children:
        found = find(child, node_id)
        if found is not None:
            return found
    return None


def node_in(document: AppDocument, node_id: str) -> AppNode:
    for screen in document.screens:
        found = find(screen.root, node_id)
        if found is not None:
            return found
    raise AssertionError(node_id)


def navigate_target(document: AppDocument, node_id: str) -> str:
    props = node_in(document, node_id).props
    assert props is not None
    assert props.on_press is not None
    action = props.on_press[0]
    assert isinstance(action, NavigateAction)
    return action.route


async def insert_app(connection: AsyncConnection, app_id: UUID, document: str) -> None:
    await connection.execute(text(INSERT_APP), {"id": app_id, "name": "Трекер привычек", "document": document})


async def insert_message(
    connection: AsyncConnection, message_id: UUID, app_id: UUID, document: str | None, accepted: bool | None
) -> None:
    await connection.execute(
        text(INSERT_MESSAGE),
        {
            "id": message_id,
            "app_id": app_id,
            "role": "assistant",
            "content": "предлагаю правку",
            "proposed_document": document,
            "accepted": accepted,
        },
    )


@pytest_asyncio.fixture
async def migration_database_url(database_url: str) -> AsyncIterator[str]:
    async with migration_database(database_url, MIGRATION_DATABASE) as url:
        yield url


def assert_tracker_migrated(document: AppDocument) -> None:
    assert [(screen.id, screen.route) for screen in document.screens] == [
        ("screen-today", "index"),
        ("screen-progress", "progress"),
        ("screen-settings", "settings"),
    ]
    assert navigate_target(document, "to-progress") == "progress"
    assert navigate_target(document, "nested-to-today") == "index"
    assert navigate_target(document, "to-today") == "index"
    assert navigate_target(document, "settings-to-progress") == "progress"
    to_progress = node_in(document, "to-progress").props
    assert to_progress is not None
    assert to_progress.href == "progress"
    site = node_in(document, "site").props
    assert site is not None
    assert site.href == "https://example.com/progress"
    assert site.model_dump(by_alias=True)["onPress"] == [{"type": "openUrl", "url": "/progress"}]
    assert document.navigation.roots == ["screen-today", "screen-progress", "screen-settings"]
    assert document.revision == 3


async def test_the_migration_strips_leading_slashes_from_routes_and_their_targets(
    migration_database_url: str,
) -> None:
    upgrade_to(migration_database_url, REVISION_BEFORE_BARE_ROUTES)

    tracker_id, colliding_id, clean_id, placeholder_id = uuid4(), uuid4(), uuid4(), uuid4()
    pending_id, accepted_id, empty_id = uuid4(), uuid4(), uuid4()
    colliding = build_document(
        colliding_id,
        [("screen-home", "index", [button("home-to-legacy", "/")]), ("screen-legacy", "/", [button("back", "index")])],
    )
    clean = build_document(clean_id, [("index", "index", [button("ghost", "/ghost")]), ("cart", "cart", [])])
    placeholder = build_document(placeholder_id, [])

    engine = create_async_engine(migration_database_url)
    try:
        async with engine.begin() as connection:
            await insert_app(connection, tracker_id, tracker(tracker_id))
            await insert_app(connection, colliding_id, colliding)
            await insert_app(connection, clean_id, clean)
            await insert_app(connection, placeholder_id, placeholder)
            await insert_message(connection, pending_id, clean_id, tracker(clean_id), None)
            await insert_message(connection, accepted_id, clean_id, tracker(clean_id), True)
            await insert_message(connection, empty_id, clean_id, None, None)
            stored_clean = (await connection.execute(text(SELECT_APP), {"id": clean_id})).scalar_one()
            stored_placeholder = (await connection.execute(text(SELECT_APP), {"id": placeholder_id})).scalar_one()

        upgrade_to(migration_database_url, REVISION_WITH_BARE_ROUTES)

        async with engine.connect() as connection:

            async def app(app_id: UUID) -> str:
                return str((await connection.execute(text(SELECT_APP), {"id": app_id})).scalar_one())

            async def proposal(message_id: UUID) -> str | None:
                return (await connection.execute(text(SELECT_PROPOSED_DOCUMENT), {"id": message_id})).scalar_one()

            migrated_tracker = await app(tracker_id)
            migrated_colliding = await app(colliding_id)
            migrated_clean = await app(clean_id)
            migrated_placeholder = await app(placeholder_id)
            pending = await proposal(pending_id)
            accepted = await proposal(accepted_id)
            empty = await proposal(empty_id)
    finally:
        await engine.dispose()

    tracker_document = AppDocument.model_validate(json.loads(migrated_tracker))
    assert_tracker_migrated(tracker_document)
    assert sorted(path for path in generate_files(tracker_document) if path.startswith("app/")) == [
        "app/_layout.tsx",
        "app/index.tsx",
        "app/progress.tsx",
        "app/settings.tsx",
    ]

    assert pending is not None
    assert accepted is not None
    assert_tracker_migrated(AppDocument.model_validate(json.loads(pending)))
    assert_tracker_migrated(AppDocument.model_validate(json.loads(accepted)))
    assert empty is None

    colliding_document = AppDocument.model_validate(json.loads(migrated_colliding))
    assert [screen.route for screen in colliding_document.screens] == ["index", "index-2"]
    assert navigate_target(colliding_document, "home-to-legacy") == "index-2"
    assert navigate_target(colliding_document, "back") == "index"

    assert migrated_clean == stored_clean
    assert migrated_placeholder == stored_placeholder
