import pytest

from src.queue.base import JobStatus, JobStatusInfo
from src.tasks.schemas import TaskStatus
from src.tasks.service import TaskService
from tests.tasks.fake_job import FakeJobStatusReader

TASK_ID = "8c90a14f-0000-4000-8000-000000000000"


@pytest.fixture
def states() -> dict[str, JobStatusInfo]:
    return {}


@pytest.fixture
def service(states: dict[str, JobStatusInfo]) -> TaskService:
    return TaskService(FakeJobStatusReader(states))


@pytest.mark.parametrize(
    ("job_status", "expected"),
    [
        ("deferred", "deferred"),
        ("queued", "queued"),
        ("in_progress", "in_progress"),
        ("not_found", "not_found"),
    ],
)
async def test_get_status_maps_job_status(
    service: TaskService,
    states: dict[str, JobStatusInfo],
    job_status: JobStatus,
    expected: TaskStatus,
) -> None:
    states[TASK_ID] = JobStatusInfo(status=job_status)

    response = await service.get_status(TASK_ID)

    assert response.id == TASK_ID
    assert response.status == expected
    assert response.result is None
    assert response.error is None


async def test_get_status_returns_not_found_for_unknown_task(service: TaskService) -> None:
    response = await service.get_status(TASK_ID)

    assert response.status == "not_found"


async def test_get_status_returns_result_of_successful_job(
    service: TaskService,
    states: dict[str, JobStatusInfo],
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete", result={"files": 12})

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result == {"files": 12}
    assert response.error is None


async def test_get_status_returns_error_of_failed_job(
    service: TaskService,
    states: dict[str, JobStatusInfo],
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete", error="Ошибка генерации приложения")

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result is None
    assert response.error == "Ошибка генерации приложения"


async def test_get_status_survives_expired_result_of_complete_job(
    service: TaskService,
    states: dict[str, JobStatusInfo],
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete")

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result is None
    assert response.error is None
