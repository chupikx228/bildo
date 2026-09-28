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

REVISION_BEFORE_FONT_ENUM = "d6a0b3e91c57"
REVISION_WITH_FONT_ENUM = "e1ab16a64eeb"

MIGRATION_DATABASE = "apps_font_migration"

INSERT_APP = "INSERT INTO apps (id, name, document) VALUES (:id, :name, CAST(:document AS jsonb))"
INSERT_MESSAGE = """
    INSERT INTO chat_messages (id, app_id, role, content, proposed_document)
    VALUES (:id, :app_id, :role, :content, CAST(:proposed_document AS jsonb))
"""
SELECT_APP = "SELECT document::text FROM apps WHERE id = :id"
SELECT_PROPOSED_DOCUMENT = "SELECT proposed_document::text FROM chat_messages WHERE id = :id"


def build_document(app_id: UUID, font_body: str, font_heading: str) -> str:
    payload: dict[str, Any] = {
        "id": str(app_id),
        "name": "Старое приложение",
        "theme": {**THEME.model_dump(by_alias=True), "fontBody": font_body, "fontHeading": font_heading},
        "navigation": {"type": "stack", "roots": []},
        "screens": [],
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


async def test_the_migration_normalizes_legacy_theme_fonts(migration_database_url: str) -> None:
    upgrade_to(migration_database_url, REVISION_BEFORE_FONT_ENUM)

    cases = {
        ("Inter", "Montserrat"): ("Inter", "Montserrat"),
        ("system", "SYSTEM"): ("System", "System"),
        ("pt serif", "jetbrains mono"): ("PT Serif", "JetBrains Mono"),
        ("Roboto", "Roboto-Bold"): ("System", "System"),
        ("Syne", "Inter, sans-serif"): ("System", "System"),
    }
    app_ids = {fonts: uuid4() for fonts in cases}
    proposal_id, empty_message_id = uuid4(), uuid4()

    engine = create_async_engine(migration_database_url)
    try:
        async with engine.begin() as connection:
            for (body, heading), app_id in app_ids.items():
                await insert_app(connection, app_id, build_document(app_id, body, heading))
            legacy_app = app_ids[("Roboto", "Roboto-Bold")]
            await insert_message(connection, proposal_id, legacy_app, build_document(legacy_app, "system", "Lora"))
            await insert_message(connection, empty_message_id, legacy_app, None)

        upgrade_to(migration_database_url, REVISION_WITH_FONT_ENUM)

        async with engine.connect() as connection:
            documents = {
                fonts: AppDocument.model_validate(
                    json.loads((await connection.execute(text(SELECT_APP), {"id": app_id})).scalar_one())
                )
                for fonts, app_id in app_ids.items()
            }
            proposed = (await connection.execute(text(SELECT_PROPOSED_DOCUMENT), {"id": proposal_id})).scalar_one()
            empty = (await connection.execute(text(SELECT_PROPOSED_DOCUMENT), {"id": empty_message_id})).scalar_one()
    finally:
        await engine.dispose()

    for fonts, expected in cases.items():
        theme = documents[fonts].theme
        assert (theme.font_body, theme.font_heading) == expected
        assert documents[fonts].revision == 3
        assert theme.color_bg == THEME.color_bg
    proposed_theme = AppDocument.model_validate(json.loads(proposed)).theme
    assert (proposed_theme.font_body, proposed_theme.font_heading) == ("System", "Lora")
    assert empty is None
