import json
from types import TracebackType
from typing import Any, Self
from uuid import UUID

import pytest

from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.config import settings
from src.generation.exceptions import GenerationError, GenerationNotConfiguredError
from src.worker import tasks as worker_tasks
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.generation.fake_llm_client import FakeLlmClient
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import InMemoryTaskQueue

PROMPT = "трекер привычек и серии дней"


def generated_answer() -> str:
    document = build_template_document(PROMPT, None)
    return json.dumps(document.model_dump(mode="json", by_alias=True), ensure_ascii=False)


def context(answers: list[str | Exception] | None = None) -> dict[Any, Any]:
    return {"redis": object(), "llm_client": FakeLlmClient(answers or [generated_answer()])}


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

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
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


@pytest.fixture
def repository() -> InMemoryAppRepository:
    return InMemoryAppRepository()


@pytest.fixture
def sessions() -> list[FakeSession]:
    return []


@pytest.fixture(autouse=True)
def storage(monkeypatch: pytest.MonkeyPatch, repository: InMemoryAppRepository, sessions: list[FakeSession]) -> None:
    def open_session() -> FakeSession:
        session = FakeSession()
        sessions.append(session)
        return session

    monkeypatch.setattr(worker_tasks, "async_session_factory", open_session)
    monkeypatch.setattr(worker_tasks, "SqlAlchemyAppRepository", lambda _session: repository)


async def create_pending_app(repository: InMemoryAppRepository) -> UUID:
    service = AppService(repository, InMemoryTaskQueue())
    return await service.create_from_prompt(PROMPT, None)


async def test_generate_app_document_marks_app_ready(
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_pending_app(repository)

    await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "ready"
    assert app.generation_error is None
    assert len(sessions) == 1
    assert sessions[0].commits == 1
    assert sessions[0].rollbacks == 0


async def test_generate_app_document_stores_generated_document(repository: InMemoryAppRepository) -> None:
    app_id = await create_pending_app(repository)

    await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None)

    app = await repository.get(app_id)
    assert app is not None
    document = AppDocument.model_validate(app.document)
    assert document.id == str(app_id)
    assert document.prompt == PROMPT
    assert document.screens != []


async def test_generate_app_document_marks_app_failed(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    async def broken_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise RuntimeError("генерация недоступна")

    monkeypatch.setattr(worker_tasks, "generate_document", broken_generation)
    app_id = await create_pending_app(repository)

    with pytest.raises(RuntimeError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error
    assert "генерация недоступна" in app.generation_error
    assert len(sessions) == 2
    assert sessions[0].commits == 0
    assert sessions[1].commits == 1


async def test_generate_app_document_keeps_placeholder_document_on_failure(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    async def broken_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise RuntimeError("генерация недоступна")

    monkeypatch.setattr(worker_tasks, "generate_document", broken_generation)
    app_id = await create_pending_app(repository)

    with pytest.raises(RuntimeError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None)

    app = await repository.get(app_id)
    assert app is not None
    assert AppDocument.model_validate(app.document).screens == []


async def test_generate_app_document_marks_app_failed_when_model_answer_is_invalid(
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_pending_app(repository)
    answers: list[str | Exception] = ["не json"] * settings.routerai_max_retries
    ctx = context(answers)

    with pytest.raises(GenerationError):
        await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == settings.routerai_max_retries
    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error is not None
    assert str(settings.routerai_max_retries) in app.generation_error
    assert app.generation_error.startswith("Ошибка генерации приложения:")
    assert AppDocument.model_validate(app.document).screens == []
    assert len(sessions) == 2
    assert sessions[0].commits == 0
    assert sessions[1].commits == 1


async def test_generate_app_document_marks_app_failed_when_generation_is_not_configured(
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context([GenerationNotConfiguredError()])

    with pytest.raises(GenerationError):
        await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == 1
    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error is not None
    assert "не задан ключ RouterAI" in app.generation_error
    assert AppDocument.model_validate(app.document).screens == []
    assert sessions[-1].commits == 1


async def test_generate_app_document_marks_app_failed_when_the_gateway_rejects_the_request(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context([GenerationError("RouterAI отклонил запрос генерации: 400")])

    with pytest.raises(GenerationError):
        await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error is not None
    assert "RouterAI отклонил запрос генерации" in app.generation_error
    assert AppDocument.model_validate(app.document).screens == []
