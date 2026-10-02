import asyncio
import inspect
import json
import logging
from collections.abc import Callable
from types import TracebackType
from typing import Any, Self
from uuid import UUID

import pytest
from sqlalchemy.exc import IntegrityError

from src.apps.schemas import AppDocument, AppNodeLayout
from src.apps.service import AppService
from src.chat.models import REPLY_FOREIGN_KEY_CONSTRAINT, REPLY_UNIQUE_CONSTRAINT
from src.chat.prompt import DOCUMENT_REQUEST_PROBLEM
from src.chat.schemas import ChatTurnResponse
from src.chat.service import CONTEXT_HISTORY_LIMIT, ChatService
from src.config import settings
from src.generation.exceptions import GenerationError, GenerationNotConfiguredError, GenerationTimeoutError
from src.generation.json_schema import to_strict_json_schema
from src.generation.prompt import build_system_prompt
from src.generation.prompt_enricher import ENRICHER_TIMEOUT_SECONDS, enrich_prompt
from src.generation.structured_output import VALIDATION_FEEDBACK_HEADER
from src.queue.base import JobStatusInfo
from src.queue.jobs import CHAT_TURN_JOB, GENERATE_APP_DOCUMENT_JOB
from src.tasks.service import TASK_FAILURE_MESSAGE, TaskService
from src.worker import tasks as worker_tasks
from src.worker.main import WorkerSettings
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.chat.in_memory_repository import InMemoryChatRepository, integrity_error
from tests.generation.fake_llm_client import FakeLlmClient
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import InMemoryTaskQueue
from tests.in_memory_transaction import InMemoryTransaction
from tests.tasks.fake_job import FakeJobStatusReader

MODEL = "test/model"
INTERNAL_FAILURE_DETAIL = "connection refused to internal-host:5432"
PROMPT = "трекер привычек и серии дней"
BRIEF = "Трекер привычек для студентов, которые готовятся к сессии: палитра #F3F6F4, #1D3B2F, #E07A1F."


def generated_answer() -> str:
    document = build_template_document(PROMPT, None)
    return json.dumps(document.model_dump(mode="json", by_alias=True), ensure_ascii=False)


def chat_answer(reply: str, *, with_document: bool, document_revision: int = 1) -> str:
    payload: dict[str, Any] = {"reply": reply}
    if with_document:
        document = build_template_document(PROMPT, None).model_copy(update={"revision": document_revision})
        payload["document"] = document.model_dump(mode="json", by_alias=True)
    return json.dumps(payload, ensure_ascii=False)


def chat_answer_with(reply: str, document: AppDocument) -> str:
    payload = {"reply": reply, "document": document.model_dump(mode="json", by_alias=True)}
    return json.dumps(payload, ensure_ascii=False)


def without_index_route(document: AppDocument) -> AppDocument:
    screens = [
        screen.model_copy(update={"route": "today"}) if screen.route == "index" else screen
        for screen in document.screens
    ]
    return document.model_copy(update={"screens": screens})


def with_empty_roots(document: AppDocument) -> AppDocument:
    return document.model_copy(update={"navigation": document.navigation.model_copy(update={"roots": []})})


def with_roots_naming_routes_of_renamed_screens(document: AppDocument) -> AppDocument:
    screens = [screen.model_copy(update={"id": f"screen-{screen.route}"}) for screen in document.screens]
    roots = [screen.route for screen in screens]
    return document.model_copy(
        update={"screens": screens, "navigation": document.navigation.model_copy(update={"roots": roots})}
    )


def with_iphone_sized_roots(document: AppDocument) -> AppDocument:
    layout = AppNodeLayout(x=0, y=0, width=390, height=844)
    screens = [
        screen.model_copy(update={"root": screen.root.model_copy(update={"layout": layout})})
        for screen in document.screens
    ]
    return document.model_copy(update={"screens": screens})


def context(
    answers: list[str | Exception] | None = None,
    briefs: list[str | Exception] | None = None,
) -> dict[Any, Any]:
    llm_client = FakeLlmClient(answers or [generated_answer()], briefs if briefs is not None else [BRIEF])
    return {"redis": object(), "llm_client": llm_client}


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


class FakeTransaction:
    def __init__(self, session: FakeSession) -> None:
        self._session = session

    async def commit(self) -> None:
        await self._session.commit()


@pytest.fixture
def repository() -> InMemoryAppRepository:
    return InMemoryAppRepository()


@pytest.fixture
def chat_repository() -> InMemoryChatRepository:
    return InMemoryChatRepository()


@pytest.fixture
def sessions() -> list[FakeSession]:
    return []


@pytest.fixture(autouse=True)
def storage(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    def open_session() -> FakeSession:
        session = FakeSession()
        sessions.append(session)
        return session

    monkeypatch.setattr(worker_tasks, "async_session_factory", open_session)
    monkeypatch.setattr(worker_tasks, "SqlAlchemyAppRepository", lambda _session: repository)
    monkeypatch.setattr(worker_tasks, "SqlAlchemyChatRepository", lambda _session: chat_repository)
    monkeypatch.setattr(worker_tasks, "SessionTransaction", FakeTransaction)


async def create_pending_app(repository: InMemoryAppRepository) -> UUID:
    service = AppService(repository, InMemoryTaskQueue(), InMemoryTransaction(), InMemoryModelCatalog())
    return await service.create_from_prompt(PROMPT, None)


async def create_ready_app(repository: InMemoryAppRepository) -> UUID:
    app_id = await create_pending_app(repository)
    app = await repository.get(app_id)
    assert app is not None
    await repository.set_generation_status(app, "ready", None)
    return app_id


async def test_generate_app_document_marks_app_ready(
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_pending_app(repository)

    await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "ready"
    assert app.generation_error is None
    assert len(sessions) == 1
    assert sessions[0].commits == 2
    assert sessions[0].rollbacks == 0


async def test_generate_app_document_asks_the_llm_for_the_model_it_was_given(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context()

    await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert llm_client.models == [MODEL]
    assert settings.routerai_model != MODEL


async def test_generate_app_document_passes_the_model_through_to_generate_document(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    seen: list[str] = []

    async def recording_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        seen.append(str(kwargs["model"]))
        return build_template_document(prompt, name)

    monkeypatch.setattr(worker_tasks, "generate_document", recording_generation)
    app_id = await create_pending_app(repository)

    await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    assert seen == [MODEL]


async def test_generate_app_document_stores_generated_document(repository: InMemoryAppRepository) -> None:
    app_id = await create_pending_app(repository)

    await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

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
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error == worker_tasks.GENERATION_FAILURE_MESSAGE
    assert app.enriched_prompt == BRIEF
    assert len(sessions) == 2
    assert sessions[0].commits == 1
    assert sessions[1].commits == 1


async def test_generate_app_document_marks_app_failed_when_generation_exceeds_the_deadline(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    async def slow_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        await asyncio.sleep(1)
        return build_template_document(prompt, name)

    monkeypatch.setattr(worker_tasks, "generate_document", slow_generation)
    monkeypatch.setattr(worker_tasks, "GENERATION_TIMEOUT_SECONDS", 0.01)
    app_id = await create_pending_app(repository)

    with pytest.raises(GenerationTimeoutError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error == f"Ошибка генерации приложения: {GenerationTimeoutError(0.01).message}"


async def test_generate_app_document_does_not_relabel_a_timeout_raised_inside_generation(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    async def generation_with_socket_timeout(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise TimeoutError(INTERNAL_FAILURE_DETAIL)

    monkeypatch.setattr(worker_tasks, "generate_document", generation_with_socket_timeout)
    app_id = await create_pending_app(repository)

    with pytest.raises(TimeoutError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_error == worker_tasks.GENERATION_FAILURE_MESSAGE


def test_generation_job_timeout_outlives_the_enricher_and_generation_deadlines() -> None:
    job = next(function for function in WorkerSettings.functions if function.name == GENERATE_APP_DOCUMENT_JOB)

    assert job.timeout_s is not None
    assert job.timeout_s > ENRICHER_TIMEOUT_SECONDS + worker_tasks.GENERATION_TIMEOUT_SECONDS


async def test_generate_app_document_enriches_the_prompt_with_the_enricher_model_first(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context()

    await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert llm_client.text_models == [settings.routerai_enricher_model]
    assert llm_client.text_calls[0][-1]["content"] == PROMPT


async def test_generate_app_document_sends_the_brief_instead_of_the_raw_prompt(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context()

    await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    llm_client: FakeLlmClient = ctx["llm_client"]
    request = llm_client.calls[0][-1]["content"]
    assert BRIEF in request
    assert PROMPT not in request


async def test_generate_app_document_keeps_the_raw_prompt_and_stores_the_brief(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)

    await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.prompt == PROMPT
    assert app.enriched_prompt == BRIEF
    assert AppDocument.model_validate(app.document).prompt == PROMPT


async def test_generate_app_document_uses_the_rules_only_prompt_when_the_enricher_returned_a_brief(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context()

    await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert llm_client.calls[0][0]["content"] == build_system_prompt(has_brief=True)


async def test_generate_app_document_uses_the_full_design_prompt_when_the_enricher_fell_back(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context(briefs=[GenerationError("RouterAI не ответил на запрос генерации")])

    await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert llm_client.calls[0][0]["content"] == build_system_prompt(has_brief=False)


async def test_generate_app_document_falls_back_to_the_raw_prompt_when_the_enricher_fails(
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context(briefs=[GenerationError("RouterAI не ответил на запрос генерации")])

    await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert PROMPT in llm_client.calls[0][-1]["content"]
    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "ready"
    assert app.enriched_prompt is None
    assert sessions[0].commits == 1


async def test_generate_app_document_falls_back_to_the_raw_prompt_when_the_enricher_times_out(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    async def slow_enrichment(prompt: str, **kwargs: Any) -> str | None:
        return await enrich_prompt(prompt, **kwargs, timeout_seconds=0.01)

    class SlowTextClient(FakeLlmClient):
        async def complete_text(self, messages: Any, *, model: str, max_tokens: int) -> str:
            await asyncio.sleep(1)
            return BRIEF

    monkeypatch.setattr(worker_tasks, "enrich_prompt", slow_enrichment)
    app_id = await create_pending_app(repository)
    llm_client = SlowTextClient([generated_answer()])

    await worker_tasks.generate_app_document(
        {"redis": object(), "llm_client": llm_client}, str(app_id), PROMPT, None, MODEL
    )

    assert PROMPT in llm_client.calls[0][-1]["content"]
    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "ready"
    assert app.enriched_prompt is None


async def test_generate_app_document_hides_details_of_a_non_domain_failure(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    async def broken_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise RuntimeError(INTERNAL_FAILURE_DETAIL)

    monkeypatch.setattr(worker_tasks, "generate_document", broken_generation)
    app_id = await create_pending_app(repository)

    with pytest.raises(RuntimeError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_error == worker_tasks.GENERATION_FAILURE_MESSAGE
    for fragment in ("connection refused", "internal-host", "5432", "RuntimeError"):
        assert fragment not in app.generation_error


async def test_generate_app_document_hides_details_of_a_bare_key_error(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    async def broken_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise KeyError("colorPrimary")

    monkeypatch.setattr(worker_tasks, "generate_document", broken_generation)
    app_id = await create_pending_app(repository)

    with pytest.raises(KeyError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_error == worker_tasks.GENERATION_FAILURE_MESSAGE
    assert "colorPrimary" not in app.generation_error


async def test_generate_app_document_logs_the_real_cause_of_a_non_domain_failure(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    repository: InMemoryAppRepository,
) -> None:
    async def broken_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise RuntimeError(INTERNAL_FAILURE_DETAIL)

    monkeypatch.setattr(worker_tasks, "generate_document", broken_generation)
    app_id = await create_pending_app(repository)

    with caplog.at_level(logging.ERROR, logger=worker_tasks.__name__), pytest.raises(RuntimeError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    record = next(record for record in caplog.records if record.name == worker_tasks.__name__)
    assert record.levelno == logging.ERROR
    assert str(app_id) in record.getMessage()
    assert record.exc_info is not None
    assert isinstance(record.exc_info[1], RuntimeError)
    assert str(record.exc_info[1]) == INTERNAL_FAILURE_DETAIL
    assert INTERNAL_FAILURE_DETAIL in caplog.text
    assert "Traceback" in caplog.text


async def test_generate_app_document_keeps_the_domain_failure_message(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    repository: InMemoryAppRepository,
) -> None:
    async def broken_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise GenerationError("RouterAI вернул пустой ответ")

    monkeypatch.setattr(worker_tasks, "generate_document", broken_generation)
    app_id = await create_pending_app(repository)

    with caplog.at_level(logging.ERROR, logger=worker_tasks.__name__), pytest.raises(GenerationError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error == "Ошибка генерации приложения: RouterAI вернул пустой ответ"
    assert caplog.records == []


async def test_generate_app_document_keeps_placeholder_document_on_failure(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
) -> None:
    async def broken_generation(prompt: str, name: str | None, **kwargs: Any) -> AppDocument:
        raise RuntimeError("генерация недоступна")

    monkeypatch.setattr(worker_tasks, "generate_document", broken_generation)
    app_id = await create_pending_app(repository)

    with pytest.raises(RuntimeError):
        await worker_tasks.generate_app_document(context(), str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert AppDocument.model_validate(app.document).screens == []


async def test_generate_app_document_marks_app_failed_when_model_answer_is_invalid(
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_pending_app(repository)
    answers: list[str | Exception] = [f"не json {attempt}" for attempt in range(settings.routerai_max_retries)]
    ctx = context(answers)

    with pytest.raises(GenerationError):
        await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == settings.routerai_max_retries
    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error is not None
    assert str(settings.routerai_max_retries) in app.generation_error
    assert app.generation_error.startswith("Ошибка генерации приложения:")
    assert AppDocument.model_validate(app.document).screens == []
    assert app.enriched_prompt == BRIEF
    assert len(sessions) == 2
    assert sessions[0].commits == 1
    assert sessions[1].commits == 1


async def test_generate_app_document_marks_app_failed_when_generation_is_not_configured(
    repository: InMemoryAppRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_pending_app(repository)
    ctx = context([GenerationNotConfiguredError()])

    with pytest.raises(GenerationError):
        await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

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
        await worker_tasks.generate_app_document(ctx, str(app_id), PROMPT, None, MODEL)

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "failed"
    assert app.generation_error is not None
    assert "RouterAI отклонил запрос генерации" in app.generation_error
    assert AppDocument.model_validate(app.document).screens == []


async def test_chat_turn_takes_exactly_the_kwargs_the_chat_service_enqueues(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    app = await repository.get(app_id)
    assert app is not None
    await repository.set_generation_status(app, "ready", None)
    queue = InMemoryTaskQueue()
    app_service = AppService(repository, queue, InMemoryTransaction(), InMemoryModelCatalog())
    service = ChatService(InMemoryChatRepository(), app_service, InMemoryTransaction(), queue)

    await service.send_message(app_id, "добавь экран настроек")

    job = next(job for job in queue.jobs if job.job_name == CHAT_TURN_JOB)
    parameters = list(inspect.signature(worker_tasks.chat_turn).parameters)
    assert parameters[0] == "ctx"
    assert set(parameters[1:]) == set(job.kwargs)


async def test_chat_turn_appends_the_assistant_reply_with_the_proposed_document(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    await worker_tasks.chat_turn(
        context([chat_answer("готово, добавил", with_document=True)]),
        str(app_id),
        str(user_message.id),
    )

    messages = await chat_repository.list_messages(app_id)
    assert [message.role for message in messages] == ["user", "assistant"]
    assert messages[1].content == "готово, добавил"
    assert messages[1].proposed_document is not None
    assert AppDocument.model_validate(messages[1].proposed_document).screens != []
    assert messages[1].accepted is None
    assert len(sessions) == 1
    assert sessions[0].commits == 1


async def test_chat_turn_overrides_the_revision_the_model_returned_with_the_apps_own(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    app_service = AppService(repository, InMemoryTaskQueue(), InMemoryTransaction(), InMemoryModelCatalog())
    app = await repository.get(app_id)
    assert app is not None
    await app_service.save_document(app_id, AppDocument.model_validate(app.document))
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    await worker_tasks.chat_turn(
        context([chat_answer("готово, добавил", with_document=True, document_revision=999)]),
        str(app_id),
        str(user_message.id),
    )

    current = await repository.get(app_id)
    assert current is not None
    assert AppDocument.model_validate(current.document).revision == 2

    messages = await chat_repository.list_messages(app_id)
    assert messages[1].proposed_document is not None
    assert AppDocument.model_validate(messages[1].proposed_document).revision == 2


async def test_chat_turn_asks_the_llm_for_the_default_model(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")
    ctx = context([chat_answer("готово", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert llm_client.models == [settings.routerai_model]


async def test_chat_turn_leaves_the_proposed_document_null_when_the_model_only_replies(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "сколько тут экранов?")

    await worker_tasks.chat_turn(
        context([chat_answer("пока ни одного", with_document=False)]),
        str(app_id),
        str(user_message.id),
    )

    messages = await chat_repository.list_messages(app_id)
    assert len(messages) == 2
    assert messages[1].role == "assistant"
    assert messages[1].content == "пока ни одного"
    assert messages[1].proposed_document is None
    assert messages[1].accepted is None


async def test_chat_turn_retries_when_the_model_returns_a_blank_reply(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "сколько тут экранов?")
    ctx = context(
        [
            chat_answer("   \n  ", with_document=False),
            chat_answer("  пока ни одного  ", with_document=False),
        ],
    )

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == 2
    messages = await chat_repository.list_messages(app_id)
    assert [message.content for message in messages] == ["сколько тут экранов?", "пока ни одного"]


@pytest.mark.parametrize(
    ("break_document", "expected_problem"),
    [
        (without_index_route, "нет экрана, чей `route` равен `index`"),
        (with_empty_roots, "`navigation.roots` пуст"),
        (with_roots_naming_routes_of_renamed_screens, "`navigation.roots` ссылается на несуществующие `id` экранов"),
        (with_iphone_sized_roots, "`layout` корня экрана `index` — 0, 0, 390, 844"),
    ],
)
async def test_chat_turn_retries_a_proposed_document_that_breaks_the_document_rules(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    break_document: Callable[[AppDocument], AppDocument],
    expected_problem: str,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "переделай главный экран")
    broken = break_document(build_template_document(PROMPT, None))
    ctx = context([chat_answer_with("готово", broken), chat_answer("готово, исправил", with_document=True)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == 2
    assert expected_problem in llm_client.calls[1][-1]["content"]
    messages = await chat_repository.list_messages(app_id)
    assert [message.content for message in messages] == ["переделай главный экран", "готово, исправил"]
    assert messages[1].proposed_document is not None
    proposed = AppDocument.model_validate(messages[1].proposed_document)
    assert "index" in [screen.route for screen in proposed.screens]


async def test_chat_turn_retries_a_reply_that_asks_the_user_for_the_document(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "поменяй текст кнопки на «Записаться»")
    asks_for_document = chat_answer("Пришлите, пожалуйста, текущий документ приложения", with_document=False)
    ctx = context([asks_for_document, chat_answer("Готово, кнопка теперь «Записаться»", with_document=True)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == 2
    assert DOCUMENT_REQUEST_PROBLEM in llm_client.calls[1][-1]["content"]
    messages = await chat_repository.list_messages(app_id)
    assert messages[1].content == "Готово, кнопка теперь «Записаться»"
    assert messages[1].proposed_document is not None


async def test_chat_turn_does_not_retry_a_clarifying_question_without_a_document(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "поменяй текст кнопки")
    question = "Какую именно кнопку поменять и на какой текст?"
    ctx = context([chat_answer(question, with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == 1
    messages = await chat_repository.list_messages(app_id)
    assert messages[1].content == question
    assert messages[1].proposed_document is None


async def test_chat_turn_retry_feedback_is_the_message_the_prompt_marks_as_hidden_from_the_user(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "переделай главный экран")
    broken = without_index_route(build_template_document(PROMPT, None))
    ctx = context([chat_answer_with("готово", broken), chat_answer("готово", with_document=True)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    retry = llm_client.calls[1]
    feedback = retry[-1]["content"]
    assert feedback.startswith(VALIDATION_FEEDBACK_HEADER)
    assert f"«{VALIDATION_FEEDBACK_HEADER} …»" in retry[0]["content"]
    assert "пользователь её не видит" in retry[0]["content"]


async def test_chat_turn_fails_when_the_proposed_document_never_follows_the_document_rules(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "переделай главный экран")
    broken = without_index_route(build_template_document(PROMPT, None))
    answers: list[str | Exception] = [
        chat_answer_with(f"готово {attempt}", broken) for attempt in range(settings.routerai_max_retries)
    ]

    with pytest.raises(GenerationError) as error:
        await worker_tasks.chat_turn(context(answers), str(app_id), str(user_message.id))

    assert "`index`" in error.value.message
    messages = await chat_repository.list_messages(app_id)
    assert [message.role for message in messages] == ["user"]
    assert sessions[0].commits == 0


async def test_chat_turn_accepts_a_proposed_document_with_a_single_screen(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "оставь только главный экран")
    ctx = context([chat_answer_with("оставил один экран", build_template_document("blank", None))])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == 1
    messages = await chat_repository.list_messages(app_id)
    assert messages[1].proposed_document is not None
    assert len(AppDocument.model_validate(messages[1].proposed_document).screens) == 1


async def test_chat_turn_does_not_create_an_assistant_message_when_generation_fails(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")
    answers: list[str | Exception] = [f"не json {attempt}" for attempt in range(settings.routerai_max_retries)]

    with pytest.raises(GenerationError):
        await worker_tasks.chat_turn(context(answers), str(app_id), str(user_message.id))

    messages = await chat_repository.list_messages(app_id)
    assert [message.role for message in messages] == ["user"]
    assert sessions[0].commits == 0


async def test_chat_turn_does_not_create_an_assistant_message_when_generation_is_not_configured(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    with pytest.raises(GenerationNotConfiguredError):
        await worker_tasks.chat_turn(context([GenerationNotConfiguredError()]), str(app_id), str(user_message.id))

    assert [message.role for message in await chat_repository.list_messages(app_id)] == ["user"]


async def test_chat_turn_does_not_mark_the_app_failed_when_generation_fails(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    with pytest.raises(GenerationError):
        await worker_tasks.chat_turn(
            context([GenerationError("RouterAI недоступен")]),
            str(app_id),
            str(user_message.id),
        )

    app = await repository.get(app_id)
    assert app is not None
    assert app.generation_status == "ready"
    assert app.generation_error is None


async def test_chat_turn_sends_the_whole_history_when_it_is_shorter_than_the_window(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    for index in range(3):
        last = await chat_repository.create_message(app_id, "user", f"сообщение {index}")
    ctx = context([chat_answer("ок", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(last.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    sent = llm_client.calls[0]
    assert sent[0]["role"] == "system"
    assert [message["content"] for message in sent[1:]] == ["сообщение 0", "сообщение 1", "сообщение 2"]


async def test_chat_turn_sends_exactly_the_last_messages_of_the_context_window(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    total = CONTEXT_HISTORY_LIMIT + 5
    for index in range(total):
        last = await chat_repository.create_message(app_id, "user", f"сообщение {index}")
    ctx = context([chat_answer("ок", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(last.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    sent = llm_client.calls[0]
    assert len(sent) == CONTEXT_HISTORY_LIMIT + 1
    assert sent[0]["role"] == "system"
    assert [message["content"] for message in sent[1:]] == [
        f"сообщение {index}" for index in range(total - CONTEXT_HISTORY_LIMIT, total)
    ]


async def test_chat_turn_does_not_send_proposed_documents_of_past_messages(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    await chat_repository.create_message(app_id, "user", "добавь экран настроек")
    last = await chat_repository.create_message(
        app_id, "assistant", "готово", build_template_document(PROMPT, "Старое предложение")
    )
    ctx = context([chat_answer("ок", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(last.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert [message["content"] for message in llm_client.calls[0][1:]] == ["добавь экран настроек", "готово"]
    assert "Старое предложение" not in llm_client.calls[0][0]["content"]


async def test_chat_turn_puts_the_current_document_into_the_system_prompt(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    app = await repository.get(app_id)
    assert app is not None
    await repository.update_document(app, build_template_document(PROMPT, "Текущее приложение"))
    user_message = await chat_repository.create_message(app_id, "user", "что тут есть?")
    ctx = context([chat_answer("экраны на месте", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert "Текущее приложение" in llm_client.calls[0][0]["content"]


async def test_chat_turn_passes_the_chat_turn_response_schema(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")
    ctx = context([chat_answer("ок", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert llm_client.schemas[0] == to_strict_json_schema(ChatTurnResponse.model_json_schema(by_alias=True))


async def test_chat_turn_links_the_assistant_reply_to_the_answered_message(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    await worker_tasks.chat_turn(
        context([chat_answer("готово", with_document=False)]),
        str(app_id),
        str(user_message.id),
    )

    messages = await chat_repository.list_messages(app_id)
    assert messages[1].in_reply_to_id == user_message.id
    assert messages[0].in_reply_to_id is None


async def test_chat_turn_is_idempotent_when_arq_retries_the_same_message(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")
    ctx = context([chat_answer("готово", with_document=False), chat_answer("готово ещё раз", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))
    await worker_tasks.chat_turn(ctx, str(app_id), str(user_message.id))

    messages = await chat_repository.list_messages(app_id)
    assert [message.role for message in messages] == ["user", "assistant"]
    assert messages[1].content == "готово"
    llm_client: FakeLlmClient = ctx["llm_client"]
    assert len(llm_client.calls) == 1
    assert len(sessions) == 2
    assert sessions[1].commits == 0


async def test_chat_turn_treats_a_unique_constraint_violation_as_already_answered(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    async def racing_create(*args: Any, **kwargs: Any) -> None:
        raise integrity_error(REPLY_UNIQUE_CONSTRAINT)

    monkeypatch.setattr(chat_repository, "create_message", racing_create)

    await worker_tasks.chat_turn(
        context([chat_answer("готово", with_document=False)]),
        str(app_id),
        str(user_message.id),
    )

    assert sessions[0].commits == 0
    assert sessions[0].rollbacks == 1


async def test_chat_turn_reraises_an_integrity_error_from_another_constraint(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")
    foreign = integrity_error(REPLY_FOREIGN_KEY_CONSTRAINT)

    async def failing_create(*args: Any, **kwargs: Any) -> None:
        raise foreign

    monkeypatch.setattr(chat_repository, "create_message", failing_create)

    with pytest.raises(IntegrityError) as raised:
        await worker_tasks.chat_turn(
            context([chat_answer("готово", with_document=False)]),
            str(app_id),
            str(user_message.id),
        )

    assert raised.value is foreign
    assert sessions[0].commits == 0
    assert sessions[0].rollbacks == 0


async def test_chat_turn_reraises_an_integrity_error_without_a_driver_cause(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    async def failing_create(*args: Any, **kwargs: Any) -> None:
        raise IntegrityError("insert", None, Exception("что-то пошло не так"))

    monkeypatch.setattr(chat_repository, "create_message", failing_create)

    with pytest.raises(IntegrityError):
        await worker_tasks.chat_turn(
            context([chat_answer("готово", with_document=False)]),
            str(app_id),
            str(user_message.id),
        )


async def test_chat_turn_ignores_messages_added_after_the_turn_was_enqueued(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    await chat_repository.create_message(app_id, "user", "первое")
    answered = await chat_repository.create_message(app_id, "user", "второе")
    await chat_repository.create_message(app_id, "user", "третье, отправленное пока задача ждала")
    ctx = context([chat_answer("ок", with_document=False)])

    await worker_tasks.chat_turn(ctx, str(app_id), str(answered.id))

    llm_client: FakeLlmClient = ctx["llm_client"]
    assert [message["content"] for message in llm_client.calls[0][1:]] == ["первое", "второе"]


async def test_chat_turn_failure_details_do_not_reach_the_task_status(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    with pytest.raises(RuntimeError) as failure:
        await worker_tasks.chat_turn(
            context([RuntimeError(INTERNAL_FAILURE_DETAIL)]),
            str(app_id),
            str(user_message.id),
        )

    assert INTERNAL_FAILURE_DETAIL in str(failure.value)
    task_id = str(user_message.id)
    states = {task_id: JobStatusInfo(status="complete", failure=failure.value)}
    status = await TaskService(FakeJobStatusReader(states)).get_status(task_id)

    assert status.status == "complete"
    assert status.error == TASK_FAILURE_MESSAGE
    for fragment in ("connection refused", "internal-host", "5432"):
        assert fragment not in status.error


async def test_chat_turn_domain_failure_still_reaches_the_task_status(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    with pytest.raises(GenerationNotConfiguredError) as failure:
        await worker_tasks.chat_turn(
            context([GenerationNotConfiguredError()]),
            str(app_id),
            str(user_message.id),
        )

    task_id = str(user_message.id)
    states = {task_id: JobStatusInfo(status="complete", failure=failure.value)}
    status = await TaskService(FakeJobStatusReader(states)).get_status(task_id)

    assert status.error == "Генерация недоступна: не задан ключ RouterAI"


async def test_chat_turn_raises_a_timeout_error_when_generation_exceeds_the_deadline(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    async def slow_generate_structured(*args: Any, **kwargs: Any) -> ChatTurnResponse:
        await asyncio.sleep(1)
        return ChatTurnResponse(reply="слишком поздно")

    monkeypatch.setattr(worker_tasks, "generate_structured", slow_generate_structured)
    monkeypatch.setattr(worker_tasks, "CHAT_TURN_TIMEOUT_SECONDS", 0.01)
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    with pytest.raises(GenerationTimeoutError) as failure:
        await worker_tasks.chat_turn(context(), str(app_id), str(user_message.id))

    expected = GenerationTimeoutError(0.01, subject=worker_tasks.CHAT_TURN_TIMEOUT_SUBJECT)
    assert failure.value.message == expected.message
    messages = await chat_repository.list_messages(app_id)
    assert [message.role for message in messages] == ["user"]
    assert sessions[0].commits == 0


async def test_chat_turn_does_not_relabel_a_timeout_raised_inside_generation(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    async def generation_with_socket_timeout(*args: Any, **kwargs: Any) -> ChatTurnResponse:
        raise TimeoutError(INTERNAL_FAILURE_DETAIL)

    monkeypatch.setattr(worker_tasks, "generate_structured", generation_with_socket_timeout)
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    with pytest.raises(TimeoutError) as failure:
        await worker_tasks.chat_turn(context(), str(app_id), str(user_message.id))

    assert not isinstance(failure.value, GenerationTimeoutError)
    assert str(failure.value) == INTERNAL_FAILURE_DETAIL
    messages = await chat_repository.list_messages(app_id)
    assert [message.role for message in messages] == ["user"]


async def test_chat_turn_timeout_reaches_the_task_status_as_a_clean_message(
    monkeypatch: pytest.MonkeyPatch,
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
) -> None:
    async def slow_generate_structured(*args: Any, **kwargs: Any) -> ChatTurnResponse:
        await asyncio.sleep(1)
        return ChatTurnResponse(reply="слишком поздно")

    monkeypatch.setattr(worker_tasks, "generate_structured", slow_generate_structured)
    monkeypatch.setattr(worker_tasks, "CHAT_TURN_TIMEOUT_SECONDS", 0.01)
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")

    with pytest.raises(GenerationTimeoutError) as failure:
        await worker_tasks.chat_turn(context(), str(app_id), str(user_message.id))

    task_id = str(user_message.id)
    states = {task_id: JobStatusInfo(status="complete", failure=failure.value)}
    status = await TaskService(FakeJobStatusReader(states)).get_status(task_id)

    expected = GenerationTimeoutError(0.01, subject=worker_tasks.CHAT_TURN_TIMEOUT_SUBJECT)
    assert status.status == "complete"
    assert status.error == expected.message
    assert status.error is not None
    assert "Traceback" not in status.error


def test_chat_turn_job_timeout_outlives_the_chat_turn_deadline() -> None:
    job = next(function for function in WorkerSettings.functions if function.name == CHAT_TURN_JOB)

    assert job.timeout_s is not None
    assert job.timeout_s > worker_tasks.CHAT_TURN_TIMEOUT_SECONDS
