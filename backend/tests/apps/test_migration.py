import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from src.apps.schemas import AppDocument, AppNavigation, AppThemeTokens
from tests.conftest import migration_database, requires_docker, upgrade_to

pytestmark = [pytest.mark.integration, requires_docker]

REVISION_BEFORE_REVISION_COLUMN = "c4d9e1f70a26"
REVISION_WITH_REVISION_COLUMN = "b8f3d0c25a91"

MIGRATION_DATABASE = "apps_revision_migration"

INSERT_APP = """
    INSERT INTO apps (id, name, document)
    VALUES (:id, :name, CAST(:document AS jsonb))
"""
INSERT_MESSAGE = """
    INSERT INTO chat_messages (id, app_id, role, content, proposed_document)
    VALUES (:id, :app_id, :role, :content, CAST(:proposed_document AS jsonb))
"""
SELECT_APP = "SELECT revision, document::text FROM apps WHERE id = :id"
SELECT_PROPOSED_DOCUMENT = "SELECT proposed_document::text FROM chat_messages WHERE id = :id"


def build_document_without_revision(app_id: UUID) -> str:
    now = datetime.now(UTC).isoformat()
    document = AppDocument(
        id=str(app_id),
        name="Старое приложение",
        prompt="трекер привычек",
        theme=AppThemeTokens(
            color_bg="#FBFBFC",
            color_surface="#F4F4F5",
            color_border="#EBEBEE",
            color_text="#101014",
            color_text_muted="#5B5B66",
            color_primary="#5C6CF5",
            color_primary_fg="#FFFFFF",
            radius_base="9",
            font_body="Inter",
            font_heading="Inter",
        ),
        navigation=AppNavigation(type="tabs", roots=[]),
        screens=[],
        state={},
        revision=1,
        created_at=now,
        updated_at=now,
    )
    payload = document.model_dump(mode="json", by_alias=True, exclude_none=True)
    del payload["revision"]
    return json.dumps(payload, ensure_ascii=False)


async def insert_app(connection: AsyncConnection, app_id: UUID, document: str) -> None:
    await connection.execute(
        text(INSERT_APP),
        {"id": app_id, "name": "Старое приложение", "document": document},
    )


async def insert_proposal(connection: AsyncConnection, message_id: UUID, app_id: UUID, document: str) -> None:
    await connection.execute(
        text(INSERT_MESSAGE),
        {
            "id": message_id,
            "app_id": app_id,
            "role": "assistant",
            "content": "предлагаю добавить экран",
            "proposed_document": document,
        },
    )


@pytest_asyncio.fixture
async def migration_database_url(database_url: str) -> AsyncIterator[str]:
    async with migration_database(database_url, MIGRATION_DATABASE) as url:
        yield url


async def test_the_migration_backfills_the_revision_into_stored_documents(
    migration_database_url: str,
) -> None:
    upgrade_to(migration_database_url, REVISION_BEFORE_REVISION_COLUMN)

    app_id, message_id = uuid4(), uuid4()
    stored_document = build_document_without_revision(app_id)
    assert "revision" not in json.loads(stored_document)

    engine = create_async_engine(migration_database_url)
    try:
        async with engine.begin() as connection:
            await insert_app(connection, app_id, stored_document)
            await insert_proposal(connection, message_id, app_id, stored_document)

        upgrade_to(migration_database_url, REVISION_WITH_REVISION_COLUMN)

        async with engine.connect() as connection:
            revision, document = (await connection.execute(text(SELECT_APP), {"id": app_id})).one()
            proposed = (await connection.execute(text(SELECT_PROPOSED_DOCUMENT), {"id": message_id})).scalar_one()
    finally:
        await engine.dispose()

    assert revision == 1
    assert AppDocument.model_validate(json.loads(document)).revision == revision
    assert AppDocument.model_validate(json.loads(proposed)).revision == 1
