from typing import ClassVar

from arq import func
from arq.connections import RedisSettings
from arq.worker import Function

from src.queue.arq_queue import get_redis_settings
from src.queue.jobs import BUILD_EXPORT_ZIP_JOB, GENERATE_APP_DOCUMENT_JOB
from src.worker.tasks import build_export_zip, generate_app_document


class WorkerSettings:
    functions: ClassVar[list[Function]] = [
        func(generate_app_document, name=GENERATE_APP_DOCUMENT_JOB),
        func(build_export_zip, name=BUILD_EXPORT_ZIP_JOB),
    ]
    redis_settings: RedisSettings = get_redis_settings()
