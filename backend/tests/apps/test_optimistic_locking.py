from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from src.apps.exceptions import StaleRevisionError
from src.apps.repository import SqlAlchemyAppRepository
from src.apps.schemas import AppDocument, AppNavigation, AppThemeTokens, GenerationStatus
from src.apps.service import AppService
from src.transaction.session_transaction import SessionTransaction
from tests.conftest import requires_docker
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog
from tests.in_memory_task_queue import InMemoryTaskQueue

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


def build_document(app_id: str, name: str = "Test app", revision: int = 1) -> AppDocument:
    now = datetime.now(UTC).isoformat()
    return AppDocument(
        id=app_id,
        name=name,
        prompt="a habit tracker",
        theme=THEME,
        navigation=AppNavigation(type="tabs", roots=[]),
        screens=[],
        state={},
        revision=revision,
        created_at=now,
        updated_at=now,
    )


def build_service(session: AsyncSession) -> AppService:
    return AppService(
        SqlAlchemyAppRepository(session),
        InMemoryTaskQueue(),
        SessionTransaction(session),
        InMemoryModelCatalog(),
    )


@pytest_asyncio.fixture
async def committed_sessions(db_engine: AsyncEngine) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        async with db_engine.begin() as connection:
            await connection.execute(sql_text("DELETE FROM apps"))


async def seed_app(
    committed_sessions: async_sessionmaker[AsyncSession],
    revision: int = 1,
    generation_status: GenerationStatus = "ready",
) -> AppDocument:
    document = build_document(str(uuid4()), revision=revision)
    async with committed_sessions() as session:
        await SqlAlchemyAppRepository(session).create(
            document.name,
            document.prompt,
            document,
            generation_status,
            None,
        )
        await session.commit()
    return document


async def read_app(committed_sessions: async_sessionmaker[AsyncSession], app_id: UUID) -> tuple[str, int, str]:
    async with committed_sessions() as session:
        app = await SqlAlchemyAppRepository(session).get(app_id)
    assert app is not None
    return app.name, app.revision, app.generation_status


async def test_the_loser_of_two_concurrent_updates_is_rejected(
    committed_sessions: async_sessionmaker[AsyncSession],
) -> None:
    document = await seed_app(committed_sessions)
    app_id = UUID(document.id)

    async with committed_sessions() as winner_session, committed_sessions() as loser_session:
        winner_repository = SqlAlchemyAppRepository(winner_session)
        loser_repository = SqlAlchemyAppRepository(loser_session)

        winner_app = await winner_repository.get(app_id)
        loser_app = await loser_repository.get(app_id)
        assert winner_app is not None
        assert loser_app is not None
        assert winner_app.revision == 1
        assert loser_app.revision == 1

        await winner_repository.update_document(winner_app, build_document(document.id, "Победитель", 2))
        await winner_session.commit()

        with pytest.raises(StaleRevisionError):
            await loser_repository.update_document(loser_app, build_document(document.id, "Проигравший", 2))
        await loser_session.rollback()

    assert await read_app(committed_sessions, app_id) == ("Победитель", 2, "ready")


async def test_save_document_rejects_a_write_the_python_check_let_through(
    committed_sessions: async_sessionmaker[AsyncSession],
) -> None:
    document = await seed_app(committed_sessions)
    app_id = UUID(document.id)

    async with committed_sessions() as stale_session:
        stale_service = build_service(stale_session)
        stale_app = await SqlAlchemyAppRepository(stale_session).get(app_id)
        assert stale_app is not None
        assert stale_app.revision == 1

        async with committed_sessions() as fresh_session:
            await build_service(fresh_session).save_document(app_id, build_document(document.id, "Победитель", 1))
            await fresh_session.commit()

        with pytest.raises(StaleRevisionError):
            await stale_service.save_document(app_id, build_document(document.id, "Проигравший", 1))
        await stale_session.rollback()

    assert await read_app(committed_sessions, app_id) == ("Победитель", 2, "ready")


async def test_save_document_bumps_the_revision_by_one(
    committed_sessions: async_sessionmaker[AsyncSession],
) -> None:
    document = await seed_app(committed_sessions, revision=4)
    app_id = UUID(document.id)

    async with committed_sessions() as session:
        saved = await build_service(session).save_document(app_id, build_document(document.id, "Сохранено", 4))
        await session.commit()

    assert saved.revision == 5
    assert await read_app(committed_sessions, app_id) == ("Сохранено", 5, "ready")


async def test_mark_generated_bumps_the_revision(
    committed_sessions: async_sessionmaker[AsyncSession],
) -> None:
    document = await seed_app(committed_sessions, revision=4, generation_status="pending")
    app_id = UUID(document.id)

    async with committed_sessions() as session:
        await build_service(session).mark_generated(app_id, build_document(document.id, "Сгенерировано", 999))
        await session.commit()

    assert await read_app(committed_sessions, app_id) == ("Сгенерировано", 5, "ready")

    async with committed_sessions() as session:
        app = await SqlAlchemyAppRepository(session).get(app_id)
    assert app is not None
    assert AppDocument.model_validate(app.document).revision == 5


async def test_a_document_read_before_generation_cannot_overwrite_the_generated_one(
    committed_sessions: async_sessionmaker[AsyncSession],
) -> None:
    placeholder = await seed_app(committed_sessions, revision=1, generation_status="pending")
    app_id = UUID(placeholder.id)

    async with committed_sessions() as session:
        await build_service(session).mark_generated(app_id, build_document(placeholder.id, "Сгенерировано", 999))
        await session.commit()

    async with committed_sessions() as session:
        with pytest.raises(StaleRevisionError):
            await build_service(session).save_document(app_id, placeholder)
        await session.rollback()

    assert await read_app(committed_sessions, app_id) == ("Сгенерировано", 2, "ready")


async def test_mark_generation_failed_does_not_bump_the_revision(
    committed_sessions: async_sessionmaker[AsyncSession],
) -> None:
    document = await seed_app(committed_sessions, revision=4, generation_status="pending")
    app_id = UUID(document.id)

    async with committed_sessions() as session:
        await build_service(session).mark_generation_failed(app_id, "Ошибка генерации")
        await session.commit()

    assert await read_app(committed_sessions, app_id) == (document.name, 4, "failed")
