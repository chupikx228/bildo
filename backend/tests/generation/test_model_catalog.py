from collections.abc import Callable
from typing import Any

import httpx
import pytest

from src.generation.exceptions import ModelCatalogUnavailable
from src.generation.model_catalog import RouterAiModelCatalog

BASE_URL = "https://routerai.test/api/v1"
CATALOG_URL = f"{BASE_URL}/models"

Handler = Callable[[httpx.Request], httpx.Response]
BuildCatalog = Callable[..., RouterAiModelCatalog]


def model_entry(model_id: str, name: str, prompt_price: float | None) -> dict[str, Any]:
    entry: dict[str, Any] = {"id": model_id, "name": name}
    if prompt_price is not None:
        entry["pricing"] = {"prompt": prompt_price, "completion": prompt_price * 2}
    return entry


CATALOG_BODY: dict[str, Any] = {
    "data": [
        model_entry("deepseek/deepseek-v4-flash", "DeepSeek: V4 Flash", 8.3e-06),
        model_entry("openai/gpt-5", "OpenAI: GPT-5", 1.39e-04),
        model_entry("free/model", "Free model", None),
    ]
}


class StubCatalogGateway:
    def __init__(self, bodies: list[dict[str, Any] | int]) -> None:
        self._bodies = list(bodies)
        self.requests: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(str(request.url))
        body = self._bodies.pop(0) if len(self._bodies) > 1 else self._bodies[0]
        if isinstance(body, int):
            return httpx.Response(body, json={"error": "нет"})
        return httpx.Response(200, json=body)


@pytest.fixture
def build_catalog(monkeypatch: pytest.MonkeyPatch) -> BuildCatalog:
    real_client = httpx.AsyncClient

    def build(handler: Handler, ttl_seconds: float = 3600.0) -> RouterAiModelCatalog:
        def make_client(*, timeout: float) -> httpx.AsyncClient:
            return real_client(transport=httpx.MockTransport(handler))

        monkeypatch.setattr(httpx, "AsyncClient", make_client)
        return RouterAiModelCatalog(BASE_URL, ttl_seconds=ttl_seconds)

    return build


async def test_catalog_is_empty_before_the_first_fetch(build_catalog: BuildCatalog) -> None:
    catalog = build_catalog(StubCatalogGateway([CATALOG_BODY]))

    assert catalog.list_models() == []
    assert not catalog.is_valid("openai/gpt-5")


async def test_ensure_fresh_fetches_the_catalog(build_catalog: BuildCatalog) -> None:
    gateway = StubCatalogGateway([CATALOG_BODY])
    catalog = build_catalog(gateway)

    await catalog.ensure_fresh()

    assert gateway.requests == [CATALOG_URL]
    assert [model.id for model in catalog.list_models()] == [
        "deepseek/deepseek-v4-flash",
        "openai/gpt-5",
        "free/model",
    ]
    assert catalog.is_valid("openai/gpt-5")
    assert not catalog.is_valid("openai/gpt-404")


async def test_expensive_models_are_marked_as_pro(build_catalog: BuildCatalog) -> None:
    catalog = build_catalog(StubCatalogGateway([CATALOG_BODY]))

    await catalog.ensure_fresh()

    assert {model.id: model.pro for model in catalog.list_models()} == {
        "deepseek/deepseek-v4-flash": False,
        "openai/gpt-5": True,
        "free/model": False,
    }


async def test_a_model_without_a_name_falls_back_to_its_id(build_catalog: BuildCatalog) -> None:
    catalog = build_catalog(StubCatalogGateway([{"data": [{"id": "vendor/model"}]}]))

    await catalog.ensure_fresh()

    assert catalog.list_models()[0].name == "vendor/model"


async def test_unusable_entries_are_skipped(build_catalog: BuildCatalog) -> None:
    body = {"data": ["строка", {"name": "без идентификатора"}, {"id": ""}, model_entry("vendor/model", "Model", None)]}
    catalog = build_catalog(StubCatalogGateway([body]))

    await catalog.ensure_fresh()

    assert [model.id for model in catalog.list_models()] == ["vendor/model"]


async def test_a_fresh_catalog_is_not_fetched_again(build_catalog: BuildCatalog) -> None:
    gateway = StubCatalogGateway([CATALOG_BODY])
    catalog = build_catalog(gateway)

    await catalog.ensure_fresh()
    await catalog.ensure_fresh()

    assert len(gateway.requests) == 1


async def test_an_expired_catalog_is_fetched_again(build_catalog: BuildCatalog) -> None:
    gateway = StubCatalogGateway([CATALOG_BODY, {"data": [model_entry("vendor/next", "Next", None)]}])
    catalog = build_catalog(gateway, ttl_seconds=0.0)

    await catalog.ensure_fresh()
    await catalog.ensure_fresh()

    assert len(gateway.requests) == 2
    assert [model.id for model in catalog.list_models()] == ["vendor/next"]


@pytest.mark.parametrize("body", [500, {"models": []}, {"data": []}], ids=["http-error", "no-data", "empty-data"])
async def test_an_empty_catalog_reports_that_it_is_unavailable(
    build_catalog: BuildCatalog,
    body: dict[str, Any] | int,
) -> None:
    catalog = build_catalog(StubCatalogGateway([body]))

    with pytest.raises(ModelCatalogUnavailable):
        await catalog.ensure_fresh()

    assert catalog.list_models() == []


async def test_a_failed_refresh_keeps_the_previously_cached_models(build_catalog: BuildCatalog) -> None:
    gateway = StubCatalogGateway([CATALOG_BODY, 500])
    catalog = build_catalog(gateway, ttl_seconds=0.0)

    await catalog.ensure_fresh()
    await catalog.ensure_fresh()

    assert len(gateway.requests) == 2
    assert catalog.is_valid("openai/gpt-5")
