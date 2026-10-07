import asyncio
import logging
from functools import partial
from typing import Any
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.repository import SqlAlchemyAppRepository
from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.chat.prompt import SCHEMA_NAME as CHAT_SCHEMA_NAME
from src.chat.prompt import build_messages as build_chat_messages
from src.chat.prompt import response_schema as chat_response_schema
from src.chat.repository import SqlAlchemyChatRepository, is_duplicate_reply_violation
from src.chat.schemas import ChatTurnResponse
from src.chat.service import ChatService, check_chat_turn
from src.codegen.service import build_zip, generate_files
from src.config import settings
from src.database import async_session_factory
from src.exceptions import DomainError
from src.generation.dependencies import get_model_catalog
from src.generation.exceptions import GenerationTimeoutError
from src.generation.llm_client import LlmClient, enforces_response_schema
from src.generation.prompt_enricher import enrich_prompt
from src.generation.service import generate_document
from src.generation.structured_output import generate_structured
from src.queue.arq_queue import ArqTaskQueue
from src.transaction.session_transaction import SessionTransaction

logger = logging.getLogger(__name__)

GENERATION_FAILURE_MESSAGE = "Не удалось сгенерировать приложение"  # noqa: RUF001
GENERATION_TIMEOUT_SECONDS = 900
CHAT_TURN_TIMEOUT_SECONDS = 900
CHAT_TURN_TIMEOUT_SUBJECT = "ответ ассистента"


async def generate_app_document(ctx: dict[Any, Any], app_id: str, prompt: str, name: str | None, model: str) -> None:
    redis: ArqRedis = ctx["redis"]
    llm_client: LlmClient = ctx["llm_client"]
    try:
        async with async_session_factory() as session:
            service = _app_service(session, redis)
            brief = await enrich_prompt(prompt, client=llm_client, model=settings.routerai_enricher_model)
            if brief is not None:
                await service.record_enriched_prompt(UUID(app_id), brief)
                await session.commit()
            deadline = asyncio.timeout(GENERATION_TIMEOUT_SECONDS)
            try:
                async with deadline:
                    document = await generate_document(
                        prompt,
                        name,
                        client=llm_client,
                        model=model,
                        max_attempts=settings.routerai_max_retries,
                        brief=brief,
                    )
            except TimeoutError as error:
                if not deadline.expired():
                    raise
                raise GenerationTimeoutError(GENERATION_TIMEOUT_SECONDS) from error
            await service.mark_generated(UUID(app_id), document)
            await session.commit()
    except DomainError as error:
        await _mark_failed(redis, app_id, f"Ошибка генерации приложения: {error.message}")
        raise
    except Exception:
        logger.exception("Generation failed for app %s", app_id)
        await _mark_failed(redis, app_id, GENERATION_FAILURE_MESSAGE)
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
        model = settings.routerai_model
        strict_schema = enforces_response_schema(model)
        deadline = asyncio.timeout(CHAT_TURN_TIMEOUT_SECONDS)
        try:
            async with deadline:
                response = await generate_structured(
                    build_chat_messages(document, history, strict_schema=strict_schema),
                    client=llm_client,
                    schema_name=CHAT_SCHEMA_NAME,
                    schema=chat_response_schema(strict=strict_schema),
                    model=model,
                    target_model=ChatTurnResponse,
                    max_attempts=settings.routerai_max_retries,
                    subject=CHAT_TURN_TIMEOUT_SUBJECT,
                    check=partial(check_chat_turn, baseline=document),
                )
        except TimeoutError as error:
            if not deadline.expired():
                raise
            raise GenerationTimeoutError(CHAT_TURN_TIMEOUT_SECONDS, subject=CHAT_TURN_TIMEOUT_SUBJECT) from error
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


async def _mark_failed(redis: ArqRedis, app_id: str, message: str) -> None:
    async with async_session_factory() as session:
        service = _app_service(session, redis)
        await service.mark_generation_failed(UUID(app_id), message)
        await session.commit()


def _app_service(session: AsyncSession, redis: ArqRedis) -> AppService:
    return AppService(
        SqlAlchemyAppRepository(session),
        ArqTaskQueue(redis),
        SessionTransaction(session),
        get_model_catalog(),
    )
