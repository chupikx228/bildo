from typing import Protocol


class TaskQueue(Protocol):
    async def enqueue(self, job_name: str, job_id: str, **kwargs: object) -> None: ...
