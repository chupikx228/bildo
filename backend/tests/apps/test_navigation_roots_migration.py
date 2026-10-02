import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from src.apps.schemas import AppDocument
from tests.codegen.max_coverage_document import THEME
from tests.conftest import migration_database, requires_docker, upgrade_to

pytestmark = [pytest.mark.integration, requires_docker]

REVISION_BEFORE_ROOTS_AS_IDS = "e1ab16a64eeb"
REVISION_WITH_ROOTS_AS_IDS = "ecaed9c13144"

MIGRATION_DATABASE = "apps_navigation_roots_migration"

INSERT_APP = "INSERT INTO apps (id, name, document) VALUES (:id, :name, CAST(:document AS jsonb))"
INSERT_MESSAGE = """
    INSERT INTO chat_messages (id, app_id, role, content, proposed_document)
    VALUES (:id, :app_id, :role, :content, CAST(:proposed_document AS jsonb))
"""
SELECT_APP = "SELECT document::text FROM apps WHERE id = :id"
SELECT_PROPOSED_DOCUMENT = "SELECT proposed_document::text FROM chat_messages WHERE id = :id"

ScreenSpec = tuple[str, str]


def build_document(app_id: UUID, screens: list[ScreenSpec], roots: list[str]) -> str:
    payload: dict[str, Any] = {
        "id": str(app_id),
        "name": "Старое приложение",
        "theme": THEME.model_dump(by_alias=True),
        "navigation": {"type": "tabs", "roots": roots},
        "screens": [
            {"id": screen_id, "name": screen_id, "route": route, "root": {"id": f"root-{screen_id}", "type": "View"}}
            for screen_id, route in screens
        ],
        "state": {},
        "revision": 3,
        "createdAt": "2026-09-01T10:00:00+00:00",
        "updatedAt": "2026-09-01T10:00:00+00:00",
    }
    return json.dumps(payload, ensure_ascii=False)


async def insert_app(connection: AsyncConnection, app_id: UUID, document: str) -> None:
    await connection.execute(text(INSERT_APP), {"id": app_id, "name": "Старое приложение", "document": document})


async def insert_message(connection: AsyncConnection, message_id: UUID, app_id: UUID, document: str | None) -> None:
    await connection.execute(
        text(INSERT_MESSAGE),
        {
            "id": message_id,
            "app_id": app_id,
            "role": "assistant",
            "content": "предлагаю правку",
            "proposed_document": document,
        },
    )


@pytest_asyncio.fixture
async def migration_database_url(database_url: str) -> AsyncIterator[str]:
    async with migration_database(database_url, MIGRATION_DATABASE) as url:
        yield url


TRACKER = [("screen-index", "index"), ("screen-stats", "stats"), ("screen-settings", "settings")]

CASES: dict[str, tuple[list[ScreenSpec], list[str], list[str]]] = {
    "roots named routes of screens whose ids differ": (
        TRACKER,
        ["index", "stats", "settings"],
        ["screen-index", "screen-stats", "screen-settings"],
    ),
    "roots named legacy slash routes": (
        [("screen-today", "/"), ("screen-progress", "/progress")],
        ["/", "/progress"],
        ["screen-today", "screen-progress"],
    ),
    "roots already name screen ids": (
        [("scr-feed", "/"), ("scr-group", "group")],
        ["scr-feed", "scr-group"],
        ["scr-feed", "scr-group"],
    ),
    "ids equal routes": (
        [("index", "index"), ("cart", "cart")],
        ["index", "cart"],
        ["index", "cart"],
    ),
    "a subset of tabs keeps its order": (
        TRACKER,
        ["settings", "index"],
        ["screen-settings", "screen-index"],
    ),
    "mixed ids, routes, duplicates and unknown entries": (
        TRACKER,
        ["screen-stats", "stats", "index", "ghost"],
        ["screen-stats", "screen-index"],
    ),
    "an id wins over another screen's route": (
        [("cart", "basket"), ("screen-x", "cart")],
        ["cart"],
        ["cart"],
    ),
    "nothing resolvable falls back to every screen": (
        TRACKER,
        ["ghost"],
        ["screen-index", "screen-stats", "screen-settings"],
    ),
    "a placeholder without screens stays empty": ([], [], []),
}


async def test_the_migration_rewrites_roots_to_screen_ids(migration_database_url: str) -> None:
    upgrade_to(migration_database_url, REVISION_BEFORE_ROOTS_AS_IDS)

    app_ids = {case: uuid4() for case in CASES}
    proposal_id, empty_message_id = uuid4(), uuid4()

    engine = create_async_engine(migration_database_url)
    try:
        async with engine.begin() as connection:
            for case, (screens, roots, _) in CASES.items():
                await insert_app(connection, app_ids[case], build_document(app_ids[case], screens, roots))
            owner = app_ids["roots already name screen ids"]
            await insert_message(connection, proposal_id, owner, build_document(owner, TRACKER, ["stats", "index"]))
            await insert_message(connection, empty_message_id, owner, None)

        upgrade_to(migration_database_url, REVISION_WITH_ROOTS_AS_IDS)

        async with engine.connect() as connection:
            documents = {
                case: AppDocument.model_validate(
                    json.loads((await connection.execute(text(SELECT_APP), {"id": app_id})).scalar_one())
                )
                for case, app_id in app_ids.items()
            }
            proposed = (await connection.execute(text(SELECT_PROPOSED_DOCUMENT), {"id": proposal_id})).scalar_one()
            empty = (await connection.execute(text(SELECT_PROPOSED_DOCUMENT), {"id": empty_message_id})).scalar_one()
    finally:
        await engine.dispose()

    for case, (screens, _, expected) in CASES.items():
        document = documents[case]
        assert document.navigation.roots == expected, case
        assert [(screen.id, screen.route) for screen in document.screens] == screens, case
        assert document.revision == 3, case
    assert AppDocument.model_validate(json.loads(proposed)).navigation.roots == ["screen-stats", "screen-index"]
    assert empty is None
