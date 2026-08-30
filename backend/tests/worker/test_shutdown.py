from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from src.database import engine
from src.worker.main import WorkerSettings, shutdown


class FakeLlmClient:
    def __init__(self, events: list[str]) -> None:
        self._events = events

    async def aclose(self) -> None:
        self._events.append("llm_client")


class ExplodingLlmClient:
    def __init__(self, events: list[str]) -> None:
        self._events = events

    async def aclose(self) -> None:
        self._events.append("llm_client")
        raise RuntimeError("aclose failed")


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


async def test_shutdown_disposes_the_shared_engine(disposed: list[AsyncEngine], events: list[str]) -> None:
    ctx: dict[Any, Any] = {"llm_client": FakeLlmClient(events)}

    await shutdown(ctx)

    assert len(disposed) == 1
    assert disposed[0] is engine


async def test_shutdown_disposes_the_engine_after_closing_the_llm_client(
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    await shutdown({"llm_client": FakeLlmClient(events)})

    assert events == ["llm_client", "engine"]


async def test_shutdown_disposes_the_engine_without_an_llm_client(
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    await shutdown({})

    assert events == ["engine"]
    assert disposed[0] is engine


async def test_shutdown_disposes_the_engine_when_closing_the_llm_client_fails(
    disposed: list[AsyncEngine],
    events: list[str],
) -> None:
    ctx: dict[Any, Any] = {"llm_client": ExplodingLlmClient(events)}

    with pytest.raises(RuntimeError, match="aclose failed"):
        await shutdown(ctx)

    assert events == ["llm_client", "engine"]
    assert len(disposed) == 1
    assert disposed[0] is engine


def test_worker_registers_the_shutdown_hook() -> None:
    assert WorkerSettings.on_shutdown is shutdown
