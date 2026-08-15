from uuid import UUID, uuid4

from fastapi import APIRouter, Response

from src.apps.dependencies import AppServiceDep
from src.codegen.exceptions import ExportTimeout
from src.codegen.service import slugify
from src.queue.dependencies import TaskQueueDep
from src.queue.jobs import BUILD_EXPORT_ZIP_JOB

EXPORT_TIMEOUT_SECONDS = 30.0

router = APIRouter(prefix="/api/apps", tags=["codegen"])


@router.get("/{app_id}/export", response_class=Response)
async def export_app(app_id: UUID, service: AppServiceDep, task_queue: TaskQueueDep) -> Response:
    app = await service.get_app(app_id)
    try:
        archive: bytes = await task_queue.enqueue_and_wait(
            BUILD_EXPORT_ZIP_JOB,
            str(uuid4()),
            EXPORT_TIMEOUT_SECONDS,
            app_id=str(app_id),
        )
    except TimeoutError as error:
        raise ExportTimeout from error
    file_name = app.slug or slugify(app.name)
    return Response(
        content=archive,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{file_name}.zip"'},
    )
