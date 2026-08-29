from collections.abc import AsyncIterator

import httpx
import pytest

from src.generation.dependencies import get_model_catalog
from src.generation.model_catalog import CURATED_MODELS
from src.main import app
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog

EXPECTED_MODELS = [
    {"id": "deepseek/deepseek-v4-pro", "name": "DeepSeek V4 Pro", "pro": False},
    {"id": "openai/gpt-5.6-terra", "name": "OpenAI GPT-5.6 Terra", "pro": False},
    {"id": "anthropic/claude-opus-5", "name": "Claude Opus 5", "pro": True},
    {"id": "anthropic/claude-fable-5", "name": "Claude Fable 5", "pro": True},
    {"id": "openai/gpt-5.6-sol", "name": "OpenAI GPT-5.6 Sol", "pro": True},
    {"id": "x-ai/grok-4.6", "name": "Grok 4.6", "pro": True},
    {"id": "anthropic/claude-sonnet-5", "name": "Claude Sonnet 5", "pro": True},
]


@pytest.fixture
def catalog() -> InMemoryModelCatalog:
    return InMemoryModelCatalog(list(CURATED_MODELS))


@pytest.fixture
async def client(catalog: InMemoryModelCatalog) -> AsyncIterator[httpx.AsyncClient]:
    app.dependency_overrides[get_model_catalog] = lambda: catalog
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


async def test_list_models_returns_the_curated_list_in_order(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/models")

    assert response.status_code == 200
    body = response.json()
    assert list(body) == ["models"]
    assert body["models"] == EXPECTED_MODELS


async def test_list_models_returns_every_field_of_the_contract(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/models")

    models = response.json()["models"]
    assert len(models) == 7
    for model in models:
        assert set(model) == {"id", "name", "pro"}
        assert isinstance(model["id"], str)
        assert isinstance(model["name"], str)
        assert isinstance(model["pro"], bool)


async def test_list_models_refreshes_the_catalog(client: httpx.AsyncClient, catalog: InMemoryModelCatalog) -> None:
    await client.get("/api/models")

    assert catalog.refreshes == 1
