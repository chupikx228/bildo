import logging

from src.exceptions import DomainError
from src.queue.base import JobStatusReader
from src.tasks.schemas import TaskStatusResponse

logger = logging.getLogger(__name__)

TASK_FAILURE_MESSAGE = "Не удалось выполнить операцию"  # noqa: RUF001


class TaskService:
    def __init__(self, job_status_reader: JobStatusReader) -> None:
        self._job_status_reader = job_status_reader

    async def get_status(self, task_id: str) -> TaskStatusResponse:
        info = await self._job_status_reader.read(task_id)
        error = None if info.failure is None else self._describe(task_id, info.failure)
        return TaskStatusResponse(id=task_id, status=info.status, result=info.result, error=error)

    def _describe(self, task_id: str, failure: BaseException) -> str:
        if isinstance(failure, DomainError):
            return failure.message
        logger.error("Task %s failed", task_id, exc_info=failure)
        return TASK_FAILURE_MESSAGE
