import logging
from uuid import UUID

import pytest

from src.apps.exceptions import AppNotFound
from src.exceptions import DomainError
from src.generation.exceptions import GenerationError, GenerationNotConfiguredError
from src.queue.base import JobStatus, JobStatusInfo
from src.tasks import service as task_service
from src.tasks.schemas import TaskStatus
from src.tasks.service import TASK_FAILURE_MESSAGE, TaskService
from tests.tasks.fake_job import FakeJobStatusReader

TASK_ID = "8c90a14f-0000-4000-8000-000000000000"
APP_ID = UUID("2f1c6b60-0000-4000-8000-000000000000")
INTERNAL_FAILURE_DETAIL = "connection refused to internal-host:5432"


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


@pytest.mark.parametrize(
    "failure",
    [
        GenerationError("RouterAI вернул пустой ответ"),
        GenerationNotConfiguredError(),
        AppNotFound(APP_ID),
    ],
)
async def test_get_status_shows_the_message_of_a_domain_failure(
    service: TaskService,
    states: dict[str, JobStatusInfo],
    caplog: pytest.LogCaptureFixture,
    failure: DomainError,
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete", failure=failure)

    with caplog.at_level(logging.ERROR, logger=task_service.__name__):
        response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result is None
    assert response.error == failure.message
    assert caplog.records == []


@pytest.mark.parametrize(
    "failure",
    [
        RuntimeError(INTERNAL_FAILURE_DETAIL),
        KeyError("colorPrimary"),
        ValueError("/srv/bildo/backend/src/chat/service.py, строка 42"),
    ],
)
async def test_get_status_hides_details_of_a_non_domain_failure(
    service: TaskService,
    states: dict[str, JobStatusInfo],
    failure: Exception,
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete", failure=failure)

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result is None
    assert response.error == TASK_FAILURE_MESSAGE
    for fragment in ("connection refused", "internal-host", "5432", "colorPrimary", "/srv/bildo", "Error"):
        assert fragment not in response.error


async def test_get_status_logs_the_real_cause_of_a_non_domain_failure(
    service: TaskService,
    states: dict[str, JobStatusInfo],
    caplog: pytest.LogCaptureFixture,
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete", failure=RuntimeError(INTERNAL_FAILURE_DETAIL))

    with caplog.at_level(logging.ERROR, logger=task_service.__name__):
        response = await service.get_status(TASK_ID)

    assert response.error == TASK_FAILURE_MESSAGE
    record = next(record for record in caplog.records if record.name == task_service.__name__)
    assert record.levelno == logging.ERROR
    assert TASK_ID in record.getMessage()
    assert record.exc_info is not None
    assert isinstance(record.exc_info[1], RuntimeError)
    assert INTERNAL_FAILURE_DETAIL in caplog.text


async def test_get_status_survives_expired_result_of_complete_job(
    service: TaskService,
    states: dict[str, JobStatusInfo],
) -> None:
    states[TASK_ID] = JobStatusInfo(status="complete")

    response = await service.get_status(TASK_ID)

    assert response.status == "complete"
    assert response.result is None
    assert response.error is None
