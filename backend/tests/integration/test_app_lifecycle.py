import io
import zipfile
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.apps.models import App
from src.apps.repository import SqlAlchemyAppRepository
from src.apps.schemas import AppDocument, AppNavigation, AppThemeTokens
from src.apps.service import AppService
from src.dependencies import get_session
from src.main import app
from src.queue.dependencies import get_task_queue
from src.queue.jobs import BUILD_EXPORT_ZIP_JOB
from src.transaction.session_transaction import SessionTransaction
from src.worker import tasks as worker_tasks
from tests.conftest import requires_docker
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import EnqueuedJob, InMemoryTaskQueue

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


def build_document_payload(app_id: str, name: str = "Renamed app", revision: int = 1) -> dict[str, object]:
    now = datetime.now(UTC).isoformat()
    document = AppDocument(
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
    return document.model_dump(mode="json", by_alias=True)


class InlineExportTaskQueue:
    def __init__(self) -> None:
        self.jobs: list[EnqueuedJob] = []

    async def enqueue(self, job_name: str, job_id: str, **kwargs: object) -> None:
        self.jobs.append(EnqueuedJob(job_name=job_name, job_id=job_id, kwargs=kwargs))

    async def enqueue_and_wait(self, job_name: str, job_id: str, timeout_seconds: float, **kwargs: object) -> object:
        self.jobs.append(EnqueuedJob(job_name=job_name, job_id=job_id, kwargs=kwargs))
        if job_name == BUILD_EXPORT_ZIP_JOB:
            app_id = kwargs["app_id"]
            assert isinstance(app_id, str)
            return await worker_tasks.build_export_zip({"redis": object()}, app_id)
        raise NotImplementedError(job_name)


@pytest.fixture
def task_queue() -> InlineExportTaskQueue:
    return InlineExportTaskQueue()


@pytest.fixture(autouse=True)
def _run_export_job_against_test_database(
    monkeypatch: pytest.MonkeyPatch,
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    monkeypatch.setattr(worker_tasks, "async_session_factory", db_session_factory)


@pytest.fixture
async def client(
    db_session_factory: async_sessionmaker[AsyncSession],
    task_queue: InlineExportTaskQueue,
) -> AsyncIterator[httpx.AsyncClient]:
    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with db_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_task_queue] = lambda: task_queue
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


async def mark_generation_ready(db_session_factory: async_sessionmaker[AsyncSession], app_id: str) -> None:
    async with db_session_factory() as session:
        db_app = await session.get(App, UUID(app_id))
        assert db_app is not None
        db_app.generation_status = "ready"
        await session.commit()


async def run_generation(db_session_factory: async_sessionmaker[AsyncSession], app_id: str) -> None:
    async with db_session_factory() as session:
        service = AppService(
            SqlAlchemyAppRepository(session),
            InMemoryTaskQueue(),
            SessionTransaction(session),
            InMemoryModelCatalog(),
        )
        await service.mark_generated(UUID(app_id), build_template_document("a habit tracker", None))
        await session.commit()


async def test_full_app_lifecycle(
    client: httpx.AsyncClient,
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    create_response = await client.post("/api/apps", json={"prompt": "a habit tracker"})
    assert create_response.status_code == 201
    app_id = create_response.json()["id"]

    await mark_generation_ready(db_session_factory, app_id)

    get_response = await client.get(f"/api/apps/{app_id}")
    assert get_response.status_code == 200
    assert get_response.json()["generationStatus"] == "ready"

    put_response = await client.put(f"/api/apps/{app_id}", json=build_document_payload(app_id))
    assert put_response.status_code == 200
    assert put_response.json()["document"]["name"] == "Renamed app"

    get_after_put = await client.get(f"/api/apps/{app_id}")
    assert get_after_put.status_code == 200
    assert get_after_put.json()["document"]["name"] == "Renamed app"

    delete_response = await client.delete(f"/api/apps/{app_id}")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"ok": True}

    get_after_delete = await client.get(f"/api/apps/{app_id}")
    assert get_after_delete.status_code == 404
    assert "error" in get_after_delete.json()


async def test_put_while_generation_is_pending_returns_409(client: httpx.AsyncClient) -> None:
    create_response = await client.post("/api/apps", json={"prompt": "a habit tracker"})
    app_id = create_response.json()["id"]

    response = await client.put(f"/api/apps/{app_id}", json=build_document_payload(app_id))

    assert response.status_code == 409
    assert response.json()["error"] == "Приложение ещё генерируется, сохранение недоступно"


async def test_get_unknown_app_returns_404_with_error_shape(client: httpx.AsyncClient) -> None:
    response = await client.get(f"/api/apps/{uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"error": "Приложение не найдено"}


async def test_export_returns_real_zip_archive(
    client: httpx.AsyncClient,
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    create_response = await client.post("/api/apps", json={"prompt": "a habit tracker"})
    app_id = create_response.json()["id"]
    await mark_generation_ready(db_session_factory, app_id)

    response = await client.get(f"/api/apps/{app_id}/export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert "package.json" in names
    assert "app/_layout.tsx" in names


async def test_put_of_a_document_read_before_generation_returns_412(
    client: httpx.AsyncClient,
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    create_response = await client.post("/api/apps", json={"prompt": "a habit tracker"})
    app_id = create_response.json()["id"]
    placeholder = (await client.get(f"/api/apps/{app_id}")).json()["document"]
    assert placeholder["revision"] == 1
    assert placeholder["screens"] == []

    await run_generation(db_session_factory, app_id)

    generated = (await client.get(f"/api/apps/{app_id}")).json()["document"]
    assert generated["revision"] == 2
    assert generated["screens"] != []

    response = await client.put(f"/api/apps/{app_id}", json=placeholder)

    assert response.status_code == 412
    assert response.json() == {"error": "Документ устарел: приложение изменено, обновите документ перед сохранением"}

    stored = (await client.get(f"/api/apps/{app_id}")).json()["document"]
    assert stored["revision"] == 2
    assert stored["screens"] == generated["screens"]
