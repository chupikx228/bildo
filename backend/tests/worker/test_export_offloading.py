import asyncio
import threading
from time import perf_counter
from types import TracebackType
from typing import Self

import pytest

from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.codegen.service import ExpoFileMap, build_zip, generate_files
from src.worker import tasks as worker_tasks
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.codegen.max_coverage_document import build_max_coverage_document
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog
from tests.in_memory_task_queue import InMemoryTaskQueue
from tests.in_memory_transaction import InMemoryTransaction

CHILD_COPIES = 3000
LIGHT_SLEEP_SECONDS = 0.01
PROMPT = "документ, покрывающий все типы узлов и действия"


def build_heavy_document() -> AppDocument:
    base = build_max_coverage_document()
    screens = []
    for screen in base.screens:
        root = screen.root
        children = [
            child.model_copy(update={"id": f"{child.id}-{index}"})
            for index in range(CHILD_COPIES)
            for child in root.children
        ]
        screens.append(screen.model_copy(update={"root": root.model_copy(update={"children": children})}))
    return base.model_copy(update={"screens": screens})


@pytest.fixture(scope="module")
def heavy_document() -> AppDocument:
    return build_heavy_document()


@pytest.fixture(scope="module")
def cpu_seconds(heavy_document: AppDocument) -> float:
    build_zip(generate_files(heavy_document))
    started = perf_counter()
    build_zip(generate_files(heavy_document))
    return perf_counter() - started


async def light_latency(started: float) -> float:
    await asyncio.sleep(LIGHT_SLEEP_SECONDS)
    return perf_counter() - started


async def offloaded_codegen(document: AppDocument) -> bytes:
    files = await asyncio.to_thread(generate_files, document)
    return await asyncio.to_thread(build_zip, files)


async def blocking_codegen(document: AppDocument) -> bytes:
    return build_zip(generate_files(document))


async def test_offloaded_codegen_keeps_event_loop_responsive(
    heavy_document: AppDocument,
    cpu_seconds: float,
) -> None:
    started = perf_counter()
    archive, latency = await asyncio.gather(offloaded_codegen(heavy_document), light_latency(started))

    assert archive
    assert latency >= LIGHT_SLEEP_SECONDS
    assert latency < cpu_seconds / 2, (
        f"лёгкая корутина ждала {latency:.3f}s при CPU-работе {cpu_seconds:.3f}s — event loop блокируется"
    )


async def test_blocking_codegen_stalls_event_loop(
    heavy_document: AppDocument,
    cpu_seconds: float,
) -> None:
    started = perf_counter()
    archive, latency = await asyncio.gather(blocking_codegen(heavy_document), light_latency(started))

    assert archive
    assert latency >= cpu_seconds / 2, (
        f"лёгкая корутина ждала {latency:.3f}s при CPU-работе {cpu_seconds:.3f}s — "
        "тест не замечает блокировку event loop"
    )


class FakeSession:
    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        return False

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


class FakeTransaction:
    def __init__(self, session: FakeSession) -> None:
        self._session = session

    async def commit(self) -> None:
        await self._session.commit()


async def test_build_export_zip_runs_codegen_off_the_event_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    repository = InMemoryAppRepository()
    monkeypatch.setattr(worker_tasks, "async_session_factory", FakeSession)
    monkeypatch.setattr(worker_tasks, "SqlAlchemyAppRepository", lambda _session: repository)
    monkeypatch.setattr(worker_tasks, "SessionTransaction", FakeTransaction)

    service = AppService(repository, InMemoryTaskQueue(), InMemoryTransaction(), InMemoryModelCatalog())
    app_id = await service.create_from_prompt(PROMPT, None)
    await service.mark_generated(app_id, build_max_coverage_document())

    app = await repository.get(app_id)
    assert app is not None
    stored = AppDocument.model_validate(app.document)

    threads: dict[str, int] = {}

    def tracked_generate_files(document: AppDocument) -> ExpoFileMap:
        threads["generate_files"] = threading.get_ident()
        return generate_files(document)

    def tracked_build_zip(files: ExpoFileMap) -> bytes:
        threads["build_zip"] = threading.get_ident()
        return build_zip(files)

    monkeypatch.setattr(worker_tasks, "generate_files", tracked_generate_files)
    monkeypatch.setattr(worker_tasks, "build_zip", tracked_build_zip)

    archive = await worker_tasks.build_export_zip({"redis": object()}, str(app_id))

    loop_thread = threading.get_ident()
    assert threads["generate_files"] != loop_thread
    assert threads["build_zip"] != loop_thread
    assert archive == build_zip(generate_files(stored))


async def test_build_export_zip_reads_document_before_leaving_the_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    repository = InMemoryAppRepository()
    monkeypatch.setattr(worker_tasks, "async_session_factory", FakeSession)
    monkeypatch.setattr(worker_tasks, "SqlAlchemyAppRepository", lambda _session: repository)
    monkeypatch.setattr(worker_tasks, "SessionTransaction", FakeTransaction)

    service = AppService(repository, InMemoryTaskQueue(), InMemoryTransaction(), InMemoryModelCatalog())
    app_id = await service.create_from_prompt(PROMPT, None)
    await service.mark_generated(app_id, build_max_coverage_document())

    seen: list[type[object]] = []

    def recording_generate_files(document: AppDocument) -> ExpoFileMap:
        seen.append(type(document))
        return generate_files(document)

    monkeypatch.setattr(worker_tasks, "generate_files", recording_generate_files)

    await worker_tasks.build_export_zip({"redis": object()}, str(app_id))

    assert seen == [AppDocument]
