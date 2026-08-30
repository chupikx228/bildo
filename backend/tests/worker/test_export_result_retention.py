import asyncio
import contextlib
import io
import zipfile
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import pytest
from arq.connections import ArqRedis, RedisSettings, create_pool
from arq.constants import result_key_prefix
from arq.worker import Worker
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.apps.repository import SqlAlchemyAppRepository
from src.apps.service import AppService
from src.queue.arq_queue import ArqTaskQueue
from src.queue.jobs import BUILD_EXPORT_ZIP_JOB
from src.transaction.session_transaction import SessionTransaction
from src.worker import tasks as worker_tasks
from src.worker.main import EXPORT_RESULT_TTL_SECONDS, WorkerSettings
from tests.conftest import requires_docker
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import InMemoryTaskQueue

pytestmark = [pytest.mark.integration, requires_docker]

EXPORT_TIMEOUT_SECONDS = 30.0
WORKER_POLL_DELAY_SECONDS = 0.05


@pytest.fixture(autouse=True)
def _run_jobs_against_test_database(
    monkeypatch: pytest.MonkeyPatch,
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    monkeypatch.setattr(worker_tasks, "async_session_factory", db_session_factory)


@pytest.fixture
async def client_pool(redis_url: str) -> AsyncIterator[ArqRedis]:
    pool = await create_pool(RedisSettings.from_dsn(redis_url))
    yield pool
    await pool.aclose(close_connection_pool=True)


@pytest.fixture
async def running_worker(redis_url: str) -> AsyncIterator[None]:
    pool = await create_pool(RedisSettings.from_dsn(redis_url))
    worker = Worker(
        functions=WorkerSettings.functions,
        redis_pool=pool,
        poll_delay=WORKER_POLL_DELAY_SECONDS,
        handle_signals=False,
    )
    task = asyncio.create_task(worker.async_run())
    try:
        yield
    finally:
        await worker.close()
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


async def seed_ready_app(db_session_factory: async_sessionmaker[AsyncSession]) -> UUID:
    async with db_session_factory() as session:
        service = AppService(
            SqlAlchemyAppRepository(session),
            InMemoryTaskQueue(),
            SessionTransaction(session),
            InMemoryModelCatalog(),
        )
        app_id = await service.create_from_prompt("a habit tracker", None)
        await service.mark_generated(app_id, build_template_document("a habit tracker", None))
        await session.commit()
    return app_id


async def test_export_returns_the_archive_and_does_not_retain_it_in_redis(
    db_session_factory: async_sessionmaker[AsyncSession],
    client_pool: ArqRedis,
    running_worker: None,
) -> None:
    app_id = await seed_ready_app(db_session_factory)
    job_id = str(uuid4())

    archive = await ArqTaskQueue(client_pool).enqueue_and_wait(
        BUILD_EXPORT_ZIP_JOB,
        job_id,
        EXPORT_TIMEOUT_SECONDS,
        app_id=str(app_id),
    )

    assert isinstance(archive, bytes)
    names = set(zipfile.ZipFile(io.BytesIO(archive)).namelist())
    assert "package.json" in names
    assert "app/_layout.tsx" in names

    retention_ms = await client_pool.pttl(result_key_prefix + job_id)
    assert 0 < retention_ms <= EXPORT_RESULT_TTL_SECONDS * 1000

    await asyncio.sleep(EXPORT_RESULT_TTL_SECONDS + 1)
    assert await client_pool.exists(result_key_prefix + job_id) == 0
