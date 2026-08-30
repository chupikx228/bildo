import logging
from typing import Any, cast

import pytest
from arq.jobs import JobStatus as ArqJobStatus

from src.queue import arq_queue
from src.queue.arq_queue import STATUS_BY_ARQ_JOB_STATUS, ArqJobStatusReader
from src.queue.base import JobStatus

UNKNOWN_ARQ_STATUS = cast(ArqJobStatus, "cancelled")


class FakeJob:
    def __init__(self, status: ArqJobStatus) -> None:
        self._status = status

    async def status(self) -> ArqJobStatus:
        return self._status

    async def result_info(self) -> None:
        return None


def _install_job(monkeypatch: pytest.MonkeyPatch, status: ArqJobStatus) -> None:
    def build_job(job_id: str, redis: Any) -> FakeJob:
        return FakeJob(status)

    monkeypatch.setattr(arq_queue, "Job", build_job)


async def test_unknown_arq_status_falls_back_to_not_found(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    assert UNKNOWN_ARQ_STATUS not in STATUS_BY_ARQ_JOB_STATUS
    _install_job(monkeypatch, UNKNOWN_ARQ_STATUS)
    reader = ArqJobStatusReader(cast(Any, object()))

    with caplog.at_level(logging.WARNING, logger=arq_queue.__name__):
        info = await reader.read("job-1")

    assert info.status == "not_found"
    assert info.result is None
    assert info.error is None
    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "cancelled" in warnings[0].getMessage()
    assert "job-1" in warnings[0].getMessage()


@pytest.mark.parametrize(
    ("arq_status", "expected"),
    [
        (ArqJobStatus.deferred, "deferred"),
        (ArqJobStatus.queued, "queued"),
        (ArqJobStatus.in_progress, "in_progress"),
        (ArqJobStatus.complete, "complete"),
        (ArqJobStatus.not_found, "not_found"),
    ],
)
async def test_known_arq_statuses_are_mapped_without_warning(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    arq_status: ArqJobStatus,
    expected: JobStatus,
) -> None:
    _install_job(monkeypatch, arq_status)
    reader = ArqJobStatusReader(cast(Any, object()))

    with caplog.at_level(logging.WARNING, logger=arq_queue.__name__):
        info = await reader.read("job-1")

    assert info.status == expected
    assert not caplog.records
