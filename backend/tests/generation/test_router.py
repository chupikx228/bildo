from collections.abc import AsyncIterator

import httpx
import pytest

from src.generation.dependencies import get_model_catalog
from src.generation.model_catalog import ModelInfo
from src.main import app
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog

CATALOG_MODELS = [
    ModelInfo(id="deepseek/deepseek-v4-flash", name="DeepSeek: V4 Flash", pro=False),
    ModelInfo(id="openai/gpt-5", name="OpenAI: GPT-5", pro=True),
]


async def open_client(catalog: InMemoryModelCatalog) -> AsyncIterator[httpx.AsyncClient]:
    app.dependency_overrides[get_model_catalog] = lambda: catalog
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
    app.dependency_overrides.clear()


@pytest.fixture
def catalog() -> InMemoryModelCatalog:
    return InMemoryModelCatalog(CATALOG_MODELS)


@pytest.fixture
async def client(catalog: InMemoryModelCatalog) -> AsyncIterator[httpx.AsyncClient]:
    async for async_client in open_client(catalog):
        yield async_client


@pytest.fixture
async def client_without_catalog() -> AsyncIterator[httpx.AsyncClient]:
    async for async_client in open_client(InMemoryModelCatalog(available=False)):
        yield async_client


async def test_list_models_returns_the_catalog(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/models")

    assert response.status_code == 200
    body = response.json()
    assert list(body) == ["models"]
    assert body["models"] == [
        {"id": "deepseek/deepseek-v4-flash", "name": "DeepSeek: V4 Flash", "pro": False},
        {"id": "openai/gpt-5", "name": "OpenAI: GPT-5", "pro": True},
    ]


async def test_list_models_returns_every_field_of_the_contract(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/models")

    models = response.json()["models"]
    assert models
    for model in models:
        assert set(model) == {"id", "name", "pro"}
        assert isinstance(model["id"], str)
        assert isinstance(model["name"], str)
        assert isinstance(model["pro"], bool)


async def test_list_models_refreshes_the_catalog(client: httpx.AsyncClient, catalog: InMemoryModelCatalog) -> None:
    await client.get("/api/models")

    assert catalog.refreshes == 1


async def test_list_models_returns_502_when_the_catalog_is_unavailable(
    client_without_catalog: httpx.AsyncClient,
) -> None:
    response = await client_without_catalog.get("/api/models")

    assert response.status_code == 502
    assert response.json() == {"error": "Каталог моделей RouterAI недоступен"}
