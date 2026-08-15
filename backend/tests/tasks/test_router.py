from collections.abc import AsyncIterator

import httpx
import pytest
from arq.jobs import JobStatus

from src.main import app
from src.queue.dependencies import get_arq_redis
from tests.tasks.fake_job import FakeJobState, FakeResultInfo, install_fake_job

TASK_ID = "8c90a14f-0000-4000-8000-000000000000"


@pytest.fixture
def states() -> dict[str, FakeJobState]:
    return {}


@pytest.fixture
async def client(monkeypatch: pytest.MonkeyPatch, states: dict[str, FakeJobState]) -> AsyncIterator[httpx.AsyncClient]:
    install_fake_job(monkeypatch, states)
    app.dependency_overrides[get_arq_redis] = lambda: object()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


async def test_get_task_returns_queued_status(client: httpx.AsyncClient, states: dict[str, FakeJobState]) -> None:
    states[TASK_ID] = FakeJobState(status=JobStatus.queued)

    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.status_code == 200
    assert response.json() == {"id": TASK_ID, "status": "queued", "result": None, "error": None}


async def test_get_task_returns_in_progress_status(client: httpx.AsyncClient, states: dict[str, FakeJobState]) -> None:
    states[TASK_ID] = FakeJobState(status=JobStatus.in_progress)

    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.json()["status"] == "in_progress"


async def test_get_task_returns_error_of_failed_job(client: httpx.AsyncClient, states: dict[str, FakeJobState]) -> None:
    states[TASK_ID] = FakeJobState(
        status=JobStatus.complete,
        result_info=FakeResultInfo(success=False, result=RuntimeError("Ошибка генерации приложения")),
    )

    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.status_code == 200
    assert response.json() == {
        "id": TASK_ID,
        "status": "complete",
        "result": None,
        "error": "Ошибка генерации приложения",
    }


async def test_get_task_returns_200_for_unknown_task(client: httpx.AsyncClient) -> None:
    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.status_code == 200
    assert response.json() == {"id": TASK_ID, "status": "not_found", "result": None, "error": None}


async def test_get_task_accepts_any_id_shape(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/tasks/not-a-uuid")

    assert response.status_code == 200
    assert response.json()["id"] == "not-a-uuid"
