from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.apps.repository import SqlAlchemyAppRepository
from src.apps.schemas import AppDocument, AppNavigation, AppThemeTokens
from tests.codegen.max_coverage_document import build_max_coverage_document
from tests.conftest import requires_docker

pytestmark = [pytest.mark.integration, requires_docker]

THEME = AppThemeTokens(
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
)


def build_document(app_id: str | None = None, name: str = "Test app") -> AppDocument:
    now = datetime.now(UTC).isoformat()
    return AppDocument(
        id=app_id or str(uuid4()),
        name=name,
        prompt="a habit tracker",
        theme=THEME,
        navigation=AppNavigation(type="tabs", roots=[]),
        screens=[],
        state={},
        created_at=now,
        updated_at=now,
    )


@pytest_asyncio.fixture
async def session(db_session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with db_session_factory() as session:
        yield session


@pytest.fixture
def repository(session: AsyncSession) -> SqlAlchemyAppRepository:
    return SqlAlchemyAppRepository(session)


async def test_create_persists_app(repository: SqlAlchemyAppRepository) -> None:
    document = build_document()

    app = await repository.create(document.name, document.prompt, document, "pending", None)

    assert app.id == UUID(document.id)
    assert app.name == document.name
    assert app.prompt == document.prompt
    assert app.generation_status == "pending"
    assert app.document["id"] == document.id


async def test_get_returns_none_when_not_found(repository: SqlAlchemyAppRepository) -> None:
    assert await repository.get(uuid4()) is None


async def test_get_returns_created_app(repository: SqlAlchemyAppRepository) -> None:
    document = build_document()
    created = await repository.create(document.name, document.prompt, document, "ready", None)

    fetched = await repository.get(created.id)

    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.name == document.name


async def test_list_all_orders_by_updated_at_desc(
    repository: SqlAlchemyAppRepository,
    session: AsyncSession,
) -> None:
    older = await repository.create("Older", None, build_document(), "ready", None)
    newer = await repository.create("Newer", None, build_document(), "ready", None)
    older.updated_at = datetime(2020, 1, 1)
    newer.updated_at = datetime(2024, 1, 1)
    await session.flush()

    apps = await repository.list_all()

    assert [app.id for app in apps] == [newer.id, older.id]


async def test_update_document_updates_name_slug_and_document(repository: SqlAlchemyAppRepository) -> None:
    document = build_document()
    app = await repository.create(document.name, document.prompt, document, "ready", None)
    updated_document = document.model_copy(update={"name": "Renamed", "slug": "renamed-slug"})

    updated = await repository.update_document(app, updated_document)

    assert updated.name == "Renamed"
    assert updated.slug == "renamed-slug"
    assert updated.document["name"] == "Renamed"

    fetched = await repository.get(app.id)
    assert fetched is not None
    assert fetched.name == "Renamed"
    assert fetched.slug == "renamed-slug"


async def test_set_generation_status_updates_status_and_error(repository: SqlAlchemyAppRepository) -> None:
    document = build_document()
    app = await repository.create(document.name, document.prompt, document, "pending", None)

    ready = await repository.set_generation_status(app, "ready", None)
    assert ready.generation_status == "ready"
    assert ready.generation_error is None

    failed = await repository.set_generation_status(app, "failed", "Ошибка генерации")
    assert failed.generation_status == "failed"
    assert failed.generation_error == "Ошибка генерации"


async def test_delete_removes_app(repository: SqlAlchemyAppRepository, session: AsyncSession) -> None:
    document = build_document()
    app = await repository.create(document.name, document.prompt, document, "ready", None)

    deleted = await repository.delete(app.id)
    await session.flush()

    assert deleted is True
    assert await repository.get(app.id) is None


async def test_delete_returns_false_when_not_found(repository: SqlAlchemyAppRepository) -> None:
    assert await repository.delete(uuid4()) is False


async def test_jsonb_round_trip_preserves_full_document(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    document = build_max_coverage_document().model_copy(update={"id": str(uuid4())})

    async with db_session_factory() as write_session:
        write_repository = SqlAlchemyAppRepository(write_session)
        await write_repository.create(document.name, document.prompt, document, "ready", None)
        await write_session.commit()

    async with db_session_factory() as read_session:
        read_repository = SqlAlchemyAppRepository(read_session)
        fetched = await read_repository.get(UUID(document.id))

    assert fetched is not None
    assert AppDocument.model_validate(fetched.document) == document
