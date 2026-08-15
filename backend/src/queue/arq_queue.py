from typing import Any

from arq.connections import ArqRedis, RedisSettings, create_pool

from src.config import settings

RESULT_POLL_DELAY_SECONDS = 0.1


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
