from uuid import UUID

from fastapi import APIRouter, status

from src.apps.dependencies import AppServiceDep
from src.apps.schemas import (
    AppDetailResponse,
    AppDocument,
    AppListResponse,
    CreateAppRequest,
    CreateAppResponse,
)

router = APIRouter(prefix="/api/apps", tags=["apps"])


@router.get("", response_model=AppListResponse)
async def list_apps(service: AppServiceDep) -> AppListResponse:
    return AppListResponse(apps=await service.list_apps())


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateAppResponse)
async def create_app(body: CreateAppRequest, service: AppServiceDep) -> CreateAppResponse:
    app_id = await service.create_from_prompt(body.prompt, body.name, body.model)
    return CreateAppResponse(id=str(app_id))


@router.get("/{app_id}", response_model=AppDetailResponse)
async def get_app(app_id: UUID, service: AppServiceDep) -> AppDetailResponse:
    app = await service.get_app(app_id)
    return AppDetailResponse(
        id=str(app.id),
        name=app.name,
        slug=app.slug,
        document=AppDocument.model_validate(app.document),
        generation_status=app.generation_status,
        generation_error=app.generation_error,
    )


@router.put("/{app_id}")
async def save_app(app_id: UUID, document: AppDocument, service: AppServiceDep) -> dict[str, object]:
    saved = await service.save_document(app_id, document)
    return {"ok": True, "document": saved}


@router.delete("/{app_id}")
async def delete_app(app_id: UUID, service: AppServiceDep) -> dict[str, object]:
    await service.delete(app_id)
    return {"ok": True}
