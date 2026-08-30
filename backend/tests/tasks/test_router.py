from collections.abc import AsyncIterator

import httpx
import pytest

from src.generation.exceptions import GenerationError
from src.main import app
from src.queue.base import JobStatusInfo
from src.queue.dependencies import get_job_status_reader
from src.tasks.service import TASK_FAILURE_MESSAGE
from tests.tasks.fake_job import FakeJobStatusReader

TASK_ID = "8c90a14f-0000-4000-8000-000000000000"
INTERNAL_FAILURE_DETAIL = "connection refused to internal-host:5432"


@pytest.fixture
def states() -> dict[str, JobStatusInfo]:
    return {}


@pytest.fixture
async def client(states: dict[str, JobStatusInfo]) -> AsyncIterator[httpx.AsyncClient]:
    app.dependency_overrides[get_job_status_reader] = lambda: FakeJobStatusReader(states)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


async def test_get_task_returns_queued_status(client: httpx.AsyncClient, states: dict[str, JobStatusInfo]) -> None:
    states[TASK_ID] = JobStatusInfo(status="queued")

    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.status_code == 200
    assert response.json() == {"id": TASK_ID, "status": "queued", "result": None, "error": None}


async def test_get_task_returns_in_progress_status(client: httpx.AsyncClient, states: dict[str, JobStatusInfo]) -> None:
    states[TASK_ID] = JobStatusInfo(status="in_progress")

    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.json()["status"] == "in_progress"


async def test_get_task_returns_error_of_failed_job(
    client: httpx.AsyncClient, states: dict[str, JobStatusInfo]
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete", failure=GenerationError("Ошибка генерации приложения"))

    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.status_code == 200
    assert response.json() == {
        "id": TASK_ID,
        "status": "complete",
        "result": None,
        "error": "Ошибка генерации приложения",
    }


async def test_get_task_hides_details_of_a_non_domain_failure(
    client: httpx.AsyncClient, states: dict[str, JobStatusInfo]
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete", failure=RuntimeError(INTERNAL_FAILURE_DETAIL))

    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.status_code == 200
    assert response.json() == {
        "id": TASK_ID,
        "status": "complete",
        "result": None,
        "error": TASK_FAILURE_MESSAGE,
    }
    assert INTERNAL_FAILURE_DETAIL not in response.text
    assert "RuntimeError" not in response.text


async def test_get_task_returns_200_for_unknown_task(client: httpx.AsyncClient) -> None:
    response = await client.get(f"/api/tasks/{TASK_ID}")

    assert response.status_code == 200
    assert response.json() == {"id": TASK_ID, "status": "not_found", "result": None, "error": None}


async def test_get_task_accepts_any_id_shape(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/tasks/not-a-uuid")

    assert response.status_code == 200
    assert response.json()["id"] == "not-a-uuid"
