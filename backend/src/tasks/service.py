from src.queue.base import JobStatusReader
from src.tasks.schemas import TaskStatusResponse


class TaskService:
    def __init__(self, job_status_reader: JobStatusReader) -> None:
        self._job_status_reader = job_status_reader

    async def get_status(self, task_id: str) -> TaskStatusResponse:
        info = await self._job_status_reader.read(task_id)
        return TaskStatusResponse(id=task_id, status=info.status, result=info.result, error=info.error)
