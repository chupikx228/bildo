from typing import Annotated

from arq.connections import ArqRedis
from fastapi import Depends, Request

from src.queue.arq_queue import ArqJobStatusReader, ArqTaskQueue
from src.queue.base import JobStatusReader, TaskQueue


def get_arq_redis(request: Request) -> ArqRedis:
    redis: ArqRedis = request.app.state.arq_redis
    return redis


ArqRedisDep = Annotated[ArqRedis, Depends(get_arq_redis)]


def get_task_queue(redis: ArqRedisDep) -> TaskQueue:
    return ArqTaskQueue(redis)


TaskQueueDep = Annotated[TaskQueue, Depends(get_task_queue)]


def get_job_status_reader(redis: ArqRedisDep) -> JobStatusReader:
    return ArqJobStatusReader(redis)


JobStatusReaderDep = Annotated[JobStatusReader, Depends(get_job_status_reader)]
