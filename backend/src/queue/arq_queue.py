import logging
from typing import Any

from arq.connections import ArqRedis, RedisSettings, create_pool
from arq.jobs import Job
from arq.jobs import JobStatus as ArqJobStatus

from src.config import settings
from src.queue.base import JobStatus, JobStatusInfo

logger = logging.getLogger(__name__)

RESULT_POLL_DELAY_SECONDS = 0.1

STATUS_BY_ARQ_JOB_STATUS: dict[ArqJobStatus, JobStatus] = {
    ArqJobStatus.deferred: "deferred",
    ArqJobStatus.queued: "queued",
    ArqJobStatus.in_progress: "in_progress",
    ArqJobStatus.complete: "complete",
    ArqJobStatus.not_found: "not_found",
}


class TaskEnqueueError(RuntimeError):
    pass


def get_redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


async def create_arq_pool() -> ArqRedis:
    return await create_pool(get_redis_settings())


class ArqTaskQueue:
    def __init__(self, redis: ArqRedis) -> None:
        self._redis = redis

    async def enqueue(self, job_name: str, job_id: str, **kwargs: Any) -> None:
        await self._redis.enqueue_job(job_name, _job_id=job_id, **kwargs)

    async def enqueue_and_wait(self, job_name: str, job_id: str, timeout_seconds: float, **kwargs: Any) -> Any:
        job = await self._redis.enqueue_job(job_name, _job_id=job_id, **kwargs)
        if job is None:
            raise TaskEnqueueError(f"Задача {job_name} уже поставлена в очередь под идентификатором {job_id}")
        return await job.result(timeout=timeout_seconds, poll_delay=RESULT_POLL_DELAY_SECONDS)


class ArqJobStatusReader:
    def __init__(self, redis: ArqRedis) -> None:
        self._redis = redis

    async def read(self, job_id: str) -> JobStatusInfo:
        job = Job(job_id, self._redis)
        arq_status = await job.status()
        status = STATUS_BY_ARQ_JOB_STATUS.get(arq_status)
        if status is None:
            logger.warning("Unknown Arq job status %r for job %s, reporting it as not_found", arq_status, job_id)
            status = "not_found"
        if arq_status is not ArqJobStatus.complete:
            return JobStatusInfo(status=status)

        info = await job.result_info()
        if info is None:
            return JobStatusInfo(status=status)
        if info.success:
            return JobStatusInfo(status=status, result=info.result)
        return JobStatusInfo(status=status, error=str(info.result))
