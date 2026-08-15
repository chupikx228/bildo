from dataclasses import dataclass


@dataclass(frozen=True)
class EnqueuedJob:
    job_name: str
    job_id: str
    kwargs: dict[str, object]


class InMemoryTaskQueue:
    def __init__(self) -> None:
        self.jobs: list[EnqueuedJob] = []

    async def enqueue(self, job_name: str, job_id: str, **kwargs: object) -> None:
        self.jobs.append(EnqueuedJob(job_name=job_name, job_id=job_id, kwargs=kwargs))
