from dataclasses import dataclass


@dataclass(frozen=True)
class EnqueuedJob:
    job_name: str
    job_id: str
    kwargs: dict[str, object]


class InMemoryTaskQueue:
    def __init__(self, results: dict[str, object] | None = None) -> None:
        self.jobs: list[EnqueuedJob] = []
        self.results: dict[str, object] = results or {}

    async def enqueue(self, job_name: str, job_id: str, **kwargs: object) -> None:
        self.jobs.append(EnqueuedJob(job_name=job_name, job_id=job_id, kwargs=kwargs))

    async def enqueue_and_wait(self, job_name: str, job_id: str, timeout_seconds: float, **kwargs: object) -> object:
        self.jobs.append(EnqueuedJob(job_name=job_name, job_id=job_id, kwargs=kwargs))
        return self.results.get(job_name)
