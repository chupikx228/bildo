from arq.connections import ArqRedis
from arq.jobs import Job, JobStatus

from src.tasks.schemas import TaskStatus, TaskStatusResponse

STATUS_BY_JOB_STATUS: dict[JobStatus, TaskStatus] = {
    JobStatus.deferred: "deferred",
    JobStatus.queued: "queued",
    JobStatus.in_progress: "in_progress",
    JobStatus.complete: "complete",
    JobStatus.not_found: "not_found",
}


class TaskService:
    def __init__(self, redis: ArqRedis) -> None:
        self._redis = redis

    async def get_status(self, task_id: str) -> TaskStatusResponse:
        job = Job(task_id, self._redis)
        job_status = await job.status()
        status = STATUS_BY_JOB_STATUS[job_status]
        if job_status is not JobStatus.complete:
            return TaskStatusResponse(id=task_id, status=status)

        info = await job.result_info()
        if info is None:
            return TaskStatusResponse(id=task_id, status=status)
        if info.success:
            return TaskStatusResponse(id=task_id, status=status, result=info.result)
        return TaskStatusResponse(id=task_id, status=status, error=str(info.result))
