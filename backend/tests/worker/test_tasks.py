import inspect
import json
from types import TracebackType
from typing import Any, Self
from uuid import UUID

import pytest
from sqlalchemy.exc import IntegrityError

from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.chat.models import REPLY_FOREIGN_KEY_CONSTRAINT, REPLY_UNIQUE_CONSTRAINT
from src.chat.schemas import ChatTurnResponse
from src.chat.service import CONTEXT_HISTORY_LIMIT, ChatService
from src.config import settings
from src.generation.exceptions import GenerationError, GenerationNotConfiguredError
from src.queue.jobs import CHAT_TURN_JOB
from src.worker import tasks as worker_tasks
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.chat.in_memory_repository import InMemoryChatRepository, integrity_error
from tests.generation.fake_llm_client import FakeLlmClient
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import InMemoryTaskQueue
from tests.in_memory_transaction import InMemoryTransaction

PROMPT = "трекер привычек и серии дней"


def generated_answer() -> str:
    document = build_template_document(PROMPT, None)
    return json.dumps(document.model_dump(mode="json", by_alias=True), ensure_ascii=False)


def chat_answer(reply: str, *, with_document: bool) -> str:
    payload: dict[str, Any] = {"reply": reply}
    if with_document:
        payload["document"] = build_template_document(PROMPT, None).model_dump(mode="json", by_alias=True)
    return json.dumps(payload, ensure_ascii=False)


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
    service = AppService(repository, InMemoryTaskQueue(), InMemoryTransaction())
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


async def test_chat_turn_takes_exactly_the_kwargs_the_chat_service_enqueues(
    repository: InMemoryAppRepository,
) -> None:
    app_id = await create_pending_app(repository)
    app = await repository.get(app_id)
    assert app is not None
    await repository.set_generation_status(app, "ready", None)
    queue = InMemoryTaskQueue()
    app_service = AppService(repository, queue, InMemoryTransaction())
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


async def test_chat_turn_does_not_create_an_assistant_message_when_generation_fails(
    repository: InMemoryAppRepository,
    chat_repository: InMemoryChatRepository,
    sessions: list[FakeSession],
) -> None:
    app_id = await create_ready_app(repository)
    user_message = await chat_repository.create_message(app_id, "user", "добавь экран настроек")
    answers: list[str | Exception] = ["не json"] * settings.routerai_max_retries

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
    assert llm_client.schemas[0] == ChatTurnResponse.model_json_schema(by_alias=True)


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
