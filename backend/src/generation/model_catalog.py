import asyncio
import logging
import time
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ValidationError

from src.generation.exceptions import ModelCatalogUnavailable

logger = logging.getLogger(__name__)

CATALOG_TTL_SECONDS = 3600.0
CATALOG_TIMEOUT_SECONDS = 10.0
PRO_PROMPT_PRICE = 1e-4


class ModelInfo(BaseModel):
    id: str
    name: str
    pro: bool = False


class ModelCatalog(Protocol):
    async def ensure_fresh(self) -> None: ...

    def is_valid(self, model_id: str) -> bool: ...

    def list_models(self) -> list[ModelInfo]: ...


class RouterAiModelCatalog:
    def __init__(
        self,
        base_url: str,
        ttl_seconds: float = CATALOG_TTL_SECONDS,
        timeout_seconds: float = CATALOG_TIMEOUT_SECONDS,
    ) -> None:
        self._url = f"{base_url.rstrip('/')}/models"
        self._ttl_seconds = ttl_seconds
        self._timeout_seconds = timeout_seconds
        self._models: list[ModelInfo] = []
        self._ids: frozenset[str] = frozenset()
        self._fetched_at: float | None = None
        self._lock = asyncio.Lock()

    async def ensure_fresh(self) -> None:
        if self._is_fresh():
            return
        async with self._lock:
            if self._is_fresh():
                return
            try:
                models = await self._fetch()
            except (httpx.HTTPError, ValueError, ValidationError) as error:
                if not self._models:
                    raise ModelCatalogUnavailable from error
                logger.warning("RouterAI model catalog refresh failed, keeping the cached copy: %s", error)
                return
            self._store(models)

    def is_valid(self, model_id: str) -> bool:
        return model_id in self._ids

    def list_models(self) -> list[ModelInfo]:
        return list(self._models)

    def _is_fresh(self) -> bool:
        return self._fetched_at is not None and time.monotonic() - self._fetched_at < self._ttl_seconds

    def _store(self, models: list[ModelInfo]) -> None:
        self._models = models
        self._ids = frozenset(model.id for model in models)
        self._fetched_at = time.monotonic()
        logger.info("RouterAI model catalog cached: %s models from %s", len(models), self._url)

    async def _fetch(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            response = await client.get(self._url)
            response.raise_for_status()
            payload: Any = response.json()
        return _parse_catalog(payload)


def _parse_catalog(payload: Any) -> list[ModelInfo]:
    items = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise ValueError("Каталог моделей RouterAI вернул ответ без списка моделей")
    models = [model for model in (_to_model_info(item) for item in items) if model is not None]
    if not models:
        raise ValueError("Каталог моделей RouterAI вернул пустой список моделей")
    return models


def _to_model_info(item: Any) -> ModelInfo | None:
    if not isinstance(item, dict):
        return None
    model_id = item.get("id")
    if not isinstance(model_id, str) or not model_id:
        return None
    name = item.get("name")
    return ModelInfo(
        id=model_id,
        name=name if isinstance(name, str) and name else model_id,
        pro=_is_pro(item),
    )


def _is_pro(item: dict[str, Any]) -> bool:
    pricing = item.get("pricing")
    if not isinstance(pricing, dict):
        return False
    price = pricing.get("prompt")
    if not isinstance(price, str | int | float):
        return False
    try:
        return float(price) >= PRO_PROMPT_PRICE
    except ValueError:
        return False
