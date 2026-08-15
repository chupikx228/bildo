from fastapi import APIRouter

from src.tasks.dependencies import TaskServiceDep
from src.tasks.schemas import TaskStatusResponse

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task(task_id: str, service: TaskServiceDep) -> TaskStatusResponse:
    return await service.get_status(task_id)
