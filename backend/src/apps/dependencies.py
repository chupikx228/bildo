from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.repository import SqlAlchemyAppRepository
from src.apps.service import AppService
from src.dependencies import get_session
from src.queue.dependencies import TaskQueueDep


def get_app_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    task_queue: TaskQueueDep,
) -> AppService:
    return AppService(SqlAlchemyAppRepository(session), task_queue)


AppServiceDep = Annotated[AppService, Depends(get_app_service)]
