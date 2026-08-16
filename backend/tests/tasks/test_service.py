import pytest
from arq.jobs import JobStatus

from src.tasks.schemas import TaskStatus
from src.tasks.service import TaskService
from tests.tasks.fake_job import FakeJobState, FakeResultInfo, install_fake_job

TASK_ID = "8c90a14f-0000-4000-8000-000000000000"


@pytest.fixture
def states() -> dict[str, FakeJobState]:
    return {}


@pytest.fixture
def service(monkeypatch: pytest.MonkeyPatch, states: dict[str, FakeJobState]) -> TaskService:
    install_fake_job(monkeypatch, states)
    return TaskService(object())  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("job_status", "expected"),
    [
        (JobStatus.deferred, "deferred"),
        (JobStatus.queued, "queued"),
        (JobStatus.in_progress, "in_progress"),
        (JobStatus.not_found, "not_found"),
    ],
)
async def test_get_status_maps_job_status(
    service: TaskService,
    states: dict[str, FakeJobState],
    job_status: JobStatus,
    expected: TaskStatus,
) -> None:
    states[TASK_ID] = FakeJobState(status=job_status)

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
    states: dict[str, FakeJobState],
) -> None:
    states[TASK_ID] = FakeJobState(
        status=JobStatus.complete,
        result_info=FakeResultInfo(success=True, result={"files": 12}),
    )

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result == {"files": 12}
    assert response.error is None


async def test_get_status_returns_error_of_failed_job(
    service: TaskService,
    states: dict[str, FakeJobState],
) -> None:
    states[TASK_ID] = FakeJobState(
        status=JobStatus.complete,
        result_info=FakeResultInfo(success=False, result=RuntimeError("Ошибка генерации приложения")),
    )

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result is None
    assert response.error == "Ошибка генерации приложения"


async def test_get_status_survives_expired_result_of_complete_job(
    service: TaskService,
    states: dict[str, FakeJobState],
) -> None:
    states[TASK_ID] = FakeJobState(status=JobStatus.complete, result_info=None)

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result is None
    assert response.error is None
