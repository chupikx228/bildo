import asyncio
import logging
import time
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

CATALOG_TTL_SECONDS = 3600.0
CATALOG_TIMEOUT_SECONDS = 10.0


class ModelInfo(BaseModel):
    id: str
    name: str
    pro: bool = False


CURATED_MODELS: tuple[ModelInfo, ...] = (
    ModelInfo(id="deepseek/deepseek-v4-pro", name="DeepSeek V4 Pro", pro=False),
    ModelInfo(id="openai/gpt-5.6-terra", name="OpenAI GPT-5.6 Terra", pro=False),
    ModelInfo(id="anthropic/claude-opus-5", name="Claude Opus 5", pro=True),
    ModelInfo(id="anthropic/claude-fable-5", name="Claude Fable 5", pro=True),
    ModelInfo(id="openai/gpt-5.6-sol", name="OpenAI GPT-5.6 Sol", pro=True),
    ModelInfo(id="x-ai/grok-4.6", name="Grok 4.6", pro=True),
    ModelInfo(id="anthropic/claude-sonnet-5", name="Claude Sonnet 5", pro=True),
)

CURATED_MODEL_IDS: frozenset[str] = frozenset(model.id for model in CURATED_MODELS)


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
        self._valid_ids: frozenset[str] = CURATED_MODEL_IDS
        self._fetched_at: float | None = None
        self._lock = asyncio.Lock()

    async def ensure_fresh(self) -> None:
        if self._is_fresh():
            return
        async with self._lock:
            if self._is_fresh():
                return
            try:
                upstream_ids = await self._fetch()
            except (httpx.HTTPError, ValueError, ValidationError) as error:
                logger.warning("RouterAI model catalog refresh failed, curated models stay available: %s", error)
                return
            self._store(upstream_ids)

    def is_valid(self, model_id: str) -> bool:
        return model_id in self._valid_ids

    def list_models(self) -> list[ModelInfo]:
        return [model for model in CURATED_MODELS if model.id in self._valid_ids]

    def _is_fresh(self) -> bool:
        return self._fetched_at is not None and time.monotonic() - self._fetched_at < self._ttl_seconds

    def _store(self, upstream_ids: frozenset[str]) -> None:
        self._valid_ids = CURATED_MODEL_IDS & upstream_ids
        self._fetched_at = time.monotonic()
        logger.info("RouterAI model catalog cached: %s models from %s", len(upstream_ids), self._url)
        missing = sorted(CURATED_MODEL_IDS - upstream_ids)
        if missing:
            logger.warning("Curated models are missing from the RouterAI catalog: %s", ", ".join(missing))

    async def _fetch(self) -> frozenset[str]:
        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            response = await client.get(self._url)
            response.raise_for_status()
            payload: Any = response.json()
        return _parse_catalog(payload)


def _parse_catalog(payload: Any) -> frozenset[str]:
    items = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise ValueError("Каталог моделей RouterAI вернул ответ без списка моделей")
    model_ids = frozenset(model_id for model_id in (_to_model_id(item) for item in items) if model_id is not None)
    if not model_ids:
        raise ValueError("Каталог моделей RouterAI вернул пустой список моделей")
    return model_ids


def _to_model_id(item: Any) -> str | None:
    if not isinstance(item, dict):
        return None
    model_id = item.get("id")
    if not isinstance(model_id, str) or not model_id:
        return None
    return model_id
