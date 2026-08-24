from dataclasses import dataclass
from typing import Any, Literal, Protocol

JobStatus = Literal["deferred", "queued", "in_progress", "complete", "not_found"]


class TaskQueue(Protocol):
    async def enqueue(self, job_name: str, job_id: str, **kwargs: object) -> None: ...

    async def enqueue_and_wait(self, job_name: str, job_id: str, timeout_seconds: float, **kwargs: object) -> Any: ...


@dataclass(frozen=True)
class JobStatusInfo:
    status: JobStatus
    result: object | None = None
    error: str | None = None


class JobStatusReader(Protocol):
    async def read(self, job_id: str) -> JobStatusInfo: ...
