from typing import Annotated

from fastapi import Depends

from src.queue.dependencies import ArqRedisDep
from src.tasks.service import TaskService


def get_task_service(redis: ArqRedisDep) -> TaskService:
    return TaskService(redis)


TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
