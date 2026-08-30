from typing import Any, ClassVar

from arq import func
from arq.connections import RedisSettings
from arq.worker import Function

from src.generation.dependencies import build_llm_client
from src.generation.llm_client import LlmClient
from src.queue.arq_queue import get_redis_settings
from src.queue.jobs import BUILD_EXPORT_ZIP_JOB, CHAT_TURN_JOB, GENERATE_APP_DOCUMENT_JOB
from src.worker.tasks import build_export_zip, chat_turn, generate_app_document

EXPORT_RESULT_TTL_SECONDS = 5


async def startup(ctx: dict[Any, Any]) -> None:
    ctx["llm_client"] = build_llm_client()


async def shutdown(ctx: dict[Any, Any]) -> None:
    llm_client: LlmClient | None = ctx.get("llm_client")
    if llm_client is not None:
        await llm_client.aclose()


class WorkerSettings:
    functions: ClassVar[list[Function]] = [
        func(generate_app_document, name=GENERATE_APP_DOCUMENT_JOB),
        func(build_export_zip, name=BUILD_EXPORT_ZIP_JOB, keep_result=EXPORT_RESULT_TTL_SECONDS),
        func(chat_turn, name=CHAT_TURN_JOB),
    ]
    redis_settings: RedisSettings = get_redis_settings()
    on_startup = startup
    on_shutdown = shutdown
