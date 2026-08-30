import logging
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from src.generation.model_catalog import CURATED_MODELS, RouterAiModelCatalog

BASE_URL = "https://routerai.test/api/v1"
CATALOG_URL = f"{BASE_URL}/models"

Handler = Callable[[httpx.Request], httpx.Response]
BuildCatalog = Callable[..., RouterAiModelCatalog]

UPSTREAM_ONLY_MODEL = "openai/gpt-5.6-luna"


def model_entry(model_id: str) -> dict[str, Any]:
    return {"id": model_id, "name": model_id, "pricing": {"prompt": 1.39e-04}}


CATALOG_BODY: dict[str, Any] = {
    "data": [*(model_entry(model.id) for model in CURATED_MODELS), model_entry(UPSTREAM_ONLY_MODEL)]
}

MISSING_MODEL_ID = CURATED_MODELS[0].id

WITHOUT_FIRST_CURATED_BODY: dict[str, Any] = {"data": [model_entry(model.id) for model in CURATED_MODELS[1:]]}


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


def test_the_curated_list_is_the_one_agreed_with_the_customer() -> None:
    assert [(model.id, model.name, model.pro) for model in CURATED_MODELS] == [
        ("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", False),
        ("openai/gpt-5.6-terra", "OpenAI GPT-5.6 Terra", False),
        ("anthropic/claude-opus-5", "Claude Opus 5", True),
        ("anthropic/claude-fable-5", "Claude Fable 5", True),
        ("openai/gpt-5.6-sol", "OpenAI GPT-5.6 Sol", True),
        ("x-ai/grok-4.6", "Grok 4.6", True),
        ("anthropic/claude-sonnet-5", "Claude Sonnet 5", True),
    ]


async def test_the_curated_models_are_served_before_the_first_fetch(build_catalog: BuildCatalog) -> None:
    catalog = build_catalog(StubCatalogGateway([CATALOG_BODY]))

    assert catalog.list_models() == list(CURATED_MODELS)
    assert catalog.is_valid("anthropic/claude-opus-5")


async def test_every_curated_model_stays_served_when_upstream_has_them_all(
    build_catalog: BuildCatalog,
) -> None:
    gateway = StubCatalogGateway([CATALOG_BODY])
    catalog = build_catalog(gateway)

    await catalog.ensure_fresh()

    assert gateway.requests == [CATALOG_URL]
    assert catalog.list_models() == list(CURATED_MODELS)


async def test_a_model_outside_the_curated_list_is_rejected_even_when_upstream_has_it(
    build_catalog: BuildCatalog,
) -> None:
    catalog = build_catalog(StubCatalogGateway([CATALOG_BODY]))

    await catalog.ensure_fresh()

    assert not catalog.is_valid(UPSTREAM_ONLY_MODEL)
    assert not catalog.is_valid("bogus/model")


async def test_a_fresh_catalog_is_not_fetched_again(build_catalog: BuildCatalog) -> None:
    gateway = StubCatalogGateway([CATALOG_BODY])
    catalog = build_catalog(gateway)

    await catalog.ensure_fresh()
    await catalog.ensure_fresh()

    assert len(gateway.requests) == 1


async def test_an_expired_catalog_is_fetched_again(build_catalog: BuildCatalog) -> None:
    gateway = StubCatalogGateway([CATALOG_BODY, CATALOG_BODY])
    catalog = build_catalog(gateway, ttl_seconds=0.0)

    await catalog.ensure_fresh()
    await catalog.ensure_fresh()

    assert len(gateway.requests) == 2


async def test_a_curated_model_missing_upstream_is_dropped_and_logged_as_a_warning(
    build_catalog: BuildCatalog,
    caplog: pytest.LogCaptureFixture,
) -> None:
    catalog = build_catalog(StubCatalogGateway([WITHOUT_FIRST_CURATED_BODY]))

    with caplog.at_level(logging.WARNING):
        await catalog.ensure_fresh()

    assert MISSING_MODEL_ID in caplog.text
    assert not catalog.is_valid(MISSING_MODEL_ID)
    assert catalog.list_models() == list(CURATED_MODELS[1:])
    assert all(catalog.is_valid(model.id) for model in CURATED_MODELS[1:])


async def test_a_failed_refresh_keeps_the_previous_intersection(
    build_catalog: BuildCatalog,
    caplog: pytest.LogCaptureFixture,
) -> None:
    gateway = StubCatalogGateway([WITHOUT_FIRST_CURATED_BODY, 500])
    catalog = build_catalog(gateway, ttl_seconds=0.0)

    await catalog.ensure_fresh()
    with caplog.at_level(logging.WARNING):
        await catalog.ensure_fresh()

    assert len(gateway.requests) == 2
    assert "refresh failed" in caplog.text
    assert not catalog.is_valid(MISSING_MODEL_ID)
    assert catalog.list_models() == list(CURATED_MODELS[1:])


@pytest.mark.parametrize("body", [500, {"models": []}, {"data": []}], ids=["http-error", "no-data", "empty-data"])
async def test_an_upstream_failure_before_any_success_still_serves_every_curated_model(
    build_catalog: BuildCatalog,
    caplog: pytest.LogCaptureFixture,
    body: dict[str, Any] | int,
) -> None:
    catalog = build_catalog(StubCatalogGateway([body]))

    with caplog.at_level(logging.WARNING):
        await catalog.ensure_fresh()

    assert "refresh failed" in caplog.text
    assert catalog.list_models() == list(CURATED_MODELS)
    assert catalog.is_valid("anthropic/claude-opus-5")


async def test_a_failed_refresh_is_retried_on_the_next_call(build_catalog: BuildCatalog) -> None:
    gateway = StubCatalogGateway([500, CATALOG_BODY])
    catalog = build_catalog(gateway)

    await catalog.ensure_fresh()
    await catalog.ensure_fresh()

    assert len(gateway.requests) == 2
