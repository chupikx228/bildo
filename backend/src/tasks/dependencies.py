from typing import Annotated

from fastapi import Depends

from src.queue.dependencies import JobStatusReaderDep
from src.tasks.service import TaskService


def get_task_service(job_status_reader: JobStatusReaderDep) -> TaskService:
    return TaskService(job_status_reader)


TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
