from dataclasses import dataclass

import pytest
from arq.jobs import JobStatus


@dataclass(frozen=True)
class FakeResultInfo:
    success: bool
    result: object


@dataclass(frozen=True)
class FakeJobState:
    status: JobStatus
    result_info: FakeResultInfo | None = None


class FakeJob:
    def __init__(self, job_id: str, states: dict[str, FakeJobState]) -> None:
        self._state = states.get(job_id, FakeJobState(status=JobStatus.not_found))

    async def status(self) -> JobStatus:
        return self._state.status

    async def result_info(self) -> FakeResultInfo | None:
        return self._state.result_info


def install_fake_job(monkeypatch: pytest.MonkeyPatch, states: dict[str, FakeJobState]) -> None:
    def build(job_id: str, _redis: object) -> FakeJob:
        return FakeJob(job_id, states)

    monkeypatch.setattr("src.tasks.service.Job", build)
