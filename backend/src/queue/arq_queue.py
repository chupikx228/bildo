from typing import Any

from arq.connections import ArqRedis, RedisSettings, create_pool

from src.config import settings


def get_redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


async def create_arq_pool() -> ArqRedis:
    return await create_pool(get_redis_settings())


class ArqTaskQueue:
    def __init__(self, redis: ArqRedis) -> None:
        self._redis = redis

    async def enqueue(self, job_name: str, job_id: str, **kwargs: Any) -> None:
        await self._redis.enqueue_job(job_name, _job_id=job_id, **kwargs)
