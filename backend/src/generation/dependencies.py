from typing import Annotated

from fastapi import Depends

from src.config import settings
from src.generation.llm_client import LlmClient, RouterAiLlmClient
from src.generation.model_catalog import ModelCatalog, RouterAiModelCatalog


def build_llm_client() -> LlmClient:
    return RouterAiLlmClient(
        api_key=settings.routerai_api_key,
        base_url=settings.routerai_base_url,
    )


model_catalog: ModelCatalog = RouterAiModelCatalog(base_url=settings.routerai_base_url)


def get_model_catalog() -> ModelCatalog:
    return model_catalog


ModelCatalogDep = Annotated[ModelCatalog, Depends(get_model_catalog)]
