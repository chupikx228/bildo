from fastapi import APIRouter

from src.generation.dependencies import ModelCatalogDep
from src.generation.schemas import ModelListResponse

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=ModelListResponse)
async def list_models(catalog: ModelCatalogDep) -> ModelListResponse:
    await catalog.ensure_fresh()
    return ModelListResponse(models=catalog.list_models())
