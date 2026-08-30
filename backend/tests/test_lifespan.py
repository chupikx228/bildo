import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine

from src import main
from src.database import engine


class FakeArqRedis:
    def __init__(self, events: list[str]) -> None:
        self._events = events

    async def aclose(self) -> None:
        self._events.append("arq_redis")


class ExplodingArqRedis:
    def __init__(self, events: list[str]) -> None:
        self._events = events

    async def aclose(self) -> None:
        self._events.append("arq_redis")
        raise RuntimeError("aclose failed")


class FakeModelCatalog:
    async def ensure_fresh(self) -> None:
        return None


class ExplodingModelCatalog:
    async def ensure_fresh(self) -> None:
        raise RuntimeError("ensure_fresh failed")


@pytest.fixture
def events() -> list[str]:
    return []


@pytest.fixture
def disposed(monkeypatch: pytest.MonkeyPatch, events: list[str]) -> list[AsyncEngine]:
    disposed_engines: list[AsyncEngine] = []

    async def dispose(self: AsyncEngine, close: bool = True) -> None:
        disposed_engines.append(self)
        events.append("engine")

    monkeypatch.setattr(AsyncEngine, "dispose", dispose)
    return disposed_engines


@pytest.fixture(autouse=True)
def _stub_lifespan_dependencies(monkeypatch: pytest.MonkeyPatch, events: list[str]) -> None:
    async def create_arq_pool() -> FakeArqRedis:
        return FakeArqRedis(events)

    monkeypatch.setattr(main, "create_arq_pool", create_arq_pool)
    monkeypatch.setattr(main, "get_model_catalog", FakeModelCatalog)


async def test_lifespan_disposes_the_shared_engine(disposed: list[AsyncEngine]) -> None:
    async with main.lifespan(FastAPI()):
        assert disposed == []

    assert len(disposed) == 1
    assert disposed[0] is engine


async def test_lifespan_disposes_the_engine_after_closing_the_arq_pool(
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    async with main.lifespan(FastAPI()):
        assert events == []

    assert events == ["arq_redis", "engine"]


async def test_lifespan_disposes_the_engine_when_the_application_fails(
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    with pytest.raises(RuntimeError, match="boom"):
        async with main.lifespan(FastAPI()):
            raise RuntimeError("boom")

    assert events == ["arq_redis", "engine"]
    assert len(disposed) == 1
    assert disposed[0] is engine


async def test_lifespan_disposes_the_engine_when_closing_the_arq_pool_fails(
    monkeypatch: pytest.MonkeyPatch,
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    async def create_arq_pool() -> ExplodingArqRedis:
        return ExplodingArqRedis(events)

    monkeypatch.setattr(main, "create_arq_pool", create_arq_pool)

    with pytest.raises(RuntimeError, match="aclose failed"):
        async with main.lifespan(FastAPI()):
            pass

    assert events == ["arq_redis", "engine"]
    assert len(disposed) == 1
    assert disposed[0] is engine


async def test_lifespan_releases_everything_when_warming_the_catalog_fails(
    monkeypatch: pytest.MonkeyPatch,
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    monkeypatch.setattr(main, "get_model_catalog", ExplodingModelCatalog)

    with pytest.raises(RuntimeError, match="ensure_fresh failed"):
        async with main.lifespan(FastAPI()):
            pytest.fail("the application must not start when warming the catalog fails")

    assert events == ["arq_redis", "engine"]
    assert len(disposed) == 1
    assert disposed[0] is engine


async def test_lifespan_disposes_the_engine_when_creating_the_arq_pool_fails(
    monkeypatch: pytest.MonkeyPatch,
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    async def create_arq_pool() -> FakeArqRedis:
        raise RuntimeError("create_arq_pool failed")

    monkeypatch.setattr(main, "create_arq_pool", create_arq_pool)

    with pytest.raises(RuntimeError, match="create_arq_pool failed"):
        async with main.lifespan(FastAPI()):
            pytest.fail("the application must not start when the arq pool cannot be created")

    assert events == ["engine"]
    assert len(disposed) == 1
    assert disposed[0] is engine
