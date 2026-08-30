import asyncio
from typing import Any
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.repository import SqlAlchemyAppRepository
from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.chat.prompt import RESPONSE_SCHEMA as CHAT_RESPONSE_SCHEMA
from src.chat.prompt import SCHEMA_NAME as CHAT_SCHEMA_NAME
from src.chat.prompt import build_messages as build_chat_messages
from src.chat.repository import SqlAlchemyChatRepository, is_duplicate_reply_violation
from src.chat.schemas import ChatTurnResponse
from src.chat.service import ChatService
from src.codegen.service import build_zip, generate_files
from src.config import settings
from src.database import async_session_factory
from src.generation.dependencies import get_model_catalog
from src.generation.llm_client import LlmClient
from src.generation.service import generate_document
from src.generation.structured_output import generate_structured
from src.queue.arq_queue import ArqTaskQueue
from src.transaction.session_transaction import SessionTransaction


async def generate_app_document(ctx: dict[Any, Any], app_id: str, prompt: str, name: str | None, model: str) -> None:
    redis: ArqRedis = ctx["redis"]
    llm_client: LlmClient = ctx["llm_client"]
    try:
        async with async_session_factory() as session:
            service = _app_service(session, redis)
            document = await generate_document(
                prompt,
                name,
                client=llm_client,
                model=model,
                max_attempts=settings.routerai_max_retries,
            )
            await service.mark_generated(UUID(app_id), document)
            await session.commit()
    except Exception as error:
        async with async_session_factory() as failure_session:
            failure_service = _app_service(failure_session, redis)
            await failure_service.mark_generation_failed(UUID(app_id), f"Ошибка генерации приложения: {error}")
            await failure_session.commit()
        raise


async def build_export_zip(ctx: dict[Any, Any], app_id: str) -> bytes:
    redis: ArqRedis = ctx["redis"]
    async with async_session_factory() as session:
        service = _app_service(session, redis)
        app = await service.get_app(UUID(app_id))
        document = AppDocument.model_validate(app.document)
    files = await asyncio.to_thread(generate_files, document)
    return await asyncio.to_thread(build_zip, files)


async def chat_turn(ctx: dict[Any, Any], app_id: str, message_id: str) -> None:
    redis: ArqRedis = ctx["redis"]
    llm_client: LlmClient = ctx["llm_client"]
    answered_message_id = UUID(message_id)
    async with async_session_factory() as session:
        transaction = SessionTransaction(session)
        app_service = AppService(
            SqlAlchemyAppRepository(session),
            ArqTaskQueue(redis),
            transaction,
            get_model_catalog(),
        )
        chat_service = ChatService(SqlAlchemyChatRepository(session), app_service, transaction)
        if await chat_service.has_reply(answered_message_id):
            return
        document, history = await chat_service.build_context(UUID(app_id), answered_message_id)
        response = await generate_structured(
            build_chat_messages(document, history),
            client=llm_client,
            schema_name=CHAT_SCHEMA_NAME,
            schema=CHAT_RESPONSE_SCHEMA,
            model=settings.routerai_model,
            target_model=ChatTurnResponse,
            max_attempts=settings.routerai_max_retries,
            subject="ответ ассистента",
        )
        proposed = (
            response.document.model_copy(update={"revision": document.revision})
            if response.document is not None
            else None
        )
        try:
            await chat_service.add_message(
                UUID(app_id),
                "assistant",
                response.reply,
                proposed,
                answered_message_id,
            )
            await transaction.commit()
        except IntegrityError as error:
            if not is_duplicate_reply_violation(error):
                raise
            await session.rollback()


def _app_service(session: AsyncSession, redis: ArqRedis) -> AppService:
    return AppService(
        SqlAlchemyAppRepository(session),
        ArqTaskQueue(redis),
        SessionTransaction(session),
        get_model_catalog(),
    )
