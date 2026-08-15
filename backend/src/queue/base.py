from typing import Any, Protocol


class TaskQueue(Protocol):
    async def enqueue(self, job_name: str, job_id: str, **kwargs: object) -> None: ...

    async def enqueue_and_wait(self, job_name: str, job_id: str, timeout_seconds: float, **kwargs: object) -> Any: ...
