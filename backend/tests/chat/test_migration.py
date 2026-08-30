from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from tests.conftest import migration_database, requires_docker, upgrade_to

pytestmark = [pytest.mark.integration, requires_docker]

REVISION_BEFORE_SCOPED_FK = "f1a4b9c02d73"
REVISION_SCOPED_FK = "a2c7e6b18f04"

MIGRATION_DATABASE = "chat_reply_fk_migration"

INSERT_APP = """
    INSERT INTO apps (id, name, document)
    VALUES (:id, :name, '{}'::jsonb)
"""
INSERT_MESSAGE = """
    INSERT INTO chat_messages (id, app_id, role, content, in_reply_to_id)
    VALUES (:id, :app_id, :role, :content, :in_reply_to_id)
"""
SELECT_REPLY_LINKS = "SELECT id, in_reply_to_id FROM chat_messages ORDER BY sequence"


async def insert_app(connection: AsyncConnection, app_id: UUID, name: str) -> None:
    await connection.execute(text(INSERT_APP), {"id": app_id, "name": name})


async def insert_message(
    connection: AsyncConnection,
    message_id: UUID,
    app_id: UUID,
    content: str,
    in_reply_to_id: UUID | None,
) -> None:
    await connection.execute(
        text(INSERT_MESSAGE),
        {
            "id": message_id,
            "app_id": app_id,
            "role": "assistant" if in_reply_to_id is not None else "user",
            "content": content,
            "in_reply_to_id": in_reply_to_id,
        },
    )


@pytest_asyncio.fixture
async def migration_database_url(database_url: str) -> AsyncIterator[str]:
    async with migration_database(database_url, MIGRATION_DATABASE) as url:
        yield url


async def test_the_migration_detaches_cross_app_replies_and_keeps_the_valid_ones(
    migration_database_url: str,
) -> None:
    upgrade_to(migration_database_url, REVISION_BEFORE_SCOPED_FK)

    own_app, other_app = uuid4(), uuid4()
    foreign_anchor, cross_app_reply = uuid4(), uuid4()
    own_anchor, own_reply = uuid4(), uuid4()

    engine = create_async_engine(migration_database_url)
    try:
        async with engine.begin() as connection:
            await insert_app(connection, own_app, "своё приложение")
            await insert_app(connection, other_app, "чужое приложение")
            await insert_message(connection, foreign_anchor, other_app, "чужой вопрос", None)
            await insert_message(connection, cross_app_reply, own_app, "ответ на чужое", foreign_anchor)
            await insert_message(connection, own_anchor, own_app, "свой вопрос", None)
            await insert_message(connection, own_reply, own_app, "ответ на своё", own_anchor)

        upgrade_to(migration_database_url, REVISION_SCOPED_FK)

        async with engine.connect() as connection:
            links = dict((await connection.execute(text(SELECT_REPLY_LINKS))).all())
    finally:
        await engine.dispose()

    assert links == {
        foreign_anchor: None,
        cross_app_reply: None,
        own_anchor: None,
        own_reply: own_anchor,
    }
