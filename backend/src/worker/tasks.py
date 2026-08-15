from typing import Any
from uuid import UUID

from arq.connections import ArqRedis

from src.apps.repository import SqlAlchemyAppRepository
from src.apps.service import AppService
from src.database import async_session_factory
from src.generation.service import generate_document
from src.queue.arq_queue import ArqTaskQueue


async def generate_app_document(ctx: dict[Any, Any], app_id: str, prompt: str, name: str | None) -> None:
    redis: ArqRedis = ctx["redis"]
    try:
        async with async_session_factory() as session:
            service = AppService(SqlAlchemyAppRepository(session), ArqTaskQueue(redis))
            document = generate_document(prompt, name)
            await service.mark_generated(UUID(app_id), document)
            await session.commit()
    except Exception as error:
        async with async_session_factory() as failure_session:
            failure_service = AppService(SqlAlchemyAppRepository(failure_session), ArqTaskQueue(redis))
            await failure_service.mark_generation_failed(UUID(app_id), f"Ошибка генерации приложения: {error}")
            await failure_session.commit()
        raise
