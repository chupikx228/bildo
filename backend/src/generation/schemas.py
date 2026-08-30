from pydantic import BaseModel

from src.generation.model_catalog import ModelInfo


class ModelListResponse(BaseModel):
    models: list[ModelInfo]
