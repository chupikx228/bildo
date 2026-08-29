from uuid import UUID, uuid4

import pytest

from src.apps.exceptions import AppGenerationInProgress, AppNotFound
from src.apps.service import AppService
from src.chat.exceptions import ChatMessageNotFound, ChatQueueNotConfiguredError, MessageNotDecidable
from src.chat.service import CONTEXT_HISTORY_LIMIT, ChatService
from src.queue.jobs import CHAT_TURN_JOB
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.chat.in_memory_repository import InMemoryChatRepository
from tests.generation.in_memory_model_catalog import InMemoryModelCatalog
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import InMemoryTaskQueue
from tests.in_memory_transaction import FailingTransaction, InMemoryTransaction


@pytest.fixture
def app_repository() -> InMemoryAppRepository:
    return InMemoryAppRepository()


@pytest.fixture
def app_service(app_repository: InMemoryAppRepository) -> AppService:
    return AppService(app_repository, InMemoryTaskQueue(), InMemoryTransaction(), InMemoryModelCatalog())


@pytest.fixture
def chat_repository() -> InMemoryChatRepository:
    return InMemoryChatRepository()


@pytest.fixture
def events() -> list[str]:
    return []


@pytest.fixture
def task_queue(events: list[str]) -> InMemoryTaskQueue:
    return InMemoryTaskQueue(events=events)


@pytest.fixture
def transaction(events: list[str]) -> InMemoryTransaction:
    return InMemoryTransaction(events)


@pytest.fixture
def service(
    chat_repository: InMemoryChatRepository,
    app_service: AppService,
    task_queue: InMemoryTaskQueue,
    transaction: InMemoryTransaction,
) -> ChatService:
    return ChatService(chat_repository, app_service, transaction, task_queue)


@pytest.fixture
async def app_id(app_service: AppService, app_repository: InMemoryAppRepository) -> UUID:
    app_id = await app_service.create_from_prompt("трекер привычек", None)
    app = await app_service.get_app(app_id)
    await app_repository.set_generation_status(app, "ready", None)
    return app_id


@pytest.fixture
async def pending_app_id(app_service: AppService) -> UUID:
    return await app_service.create_from_prompt("список покупок", None)


async def test_list_messages_raises_not_found_for_unknown_app(service: ChatService) -> None:
    with pytest.raises(AppNotFound):
        await service.list_messages(uuid4())


async def test_add_message_raises_not_found_for_unknown_app(service: ChatService) -> None:
    with pytest.raises(AppNotFound):
        await service.add_message(uuid4(), "user", "привет")


async def test_add_message_without_proposed_document_leaves_accepted_null(
    service: ChatService,
    app_id: UUID,
) -> None:
    message = await service.add_message(app_id, "user", "привет")

    assert message.proposed_document is None
    assert message.accepted is None


async def test_add_message_with_proposed_document_leaves_accepted_null(
    service: ChatService,
    app_id: UUID,
) -> None:
    proposed = build_template_document("трекер привычек", None)

    message = await service.add_message(app_id, "assistant", "вот предложение", proposed)

    assert message.proposed_document is not None
    assert message.accepted is None


async def test_record_decision_on_user_message_raises_not_decidable(
    service: ChatService,
    app_id: UUID,
) -> None:
    message = await service.add_message(app_id, "user", "привет")

    with pytest.raises(MessageNotDecidable):
        await service.record_decision(app_id, message.id, True)


async def test_record_decision_on_assistant_message_without_proposal_raises_not_decidable(
    service: ChatService,
    app_id: UUID,
) -> None:
    message = await service.add_message(app_id, "assistant", "просто текст")

    with pytest.raises(MessageNotDecidable):
        await service.record_decision(app_id, message.id, True)


async def test_record_decision_updates_accepted_and_is_visible_in_list(
    service: ChatService,
    app_id: UUID,
) -> None:
    proposed = build_template_document("трекер привычек", None)
    message = await service.add_message(app_id, "assistant", "вот предложение", proposed)

    decided = await service.record_decision(app_id, message.id, True)
    assert decided.accepted is True

    messages = await service.list_messages(app_id)
    assert messages[0].accepted is True


async def test_record_decision_raises_not_found_for_unknown_message(service: ChatService, app_id: UUID) -> None:
    with pytest.raises(ChatMessageNotFound):
        await service.record_decision(app_id, uuid4(), True)


async def test_record_decision_raises_not_found_for_message_of_another_app(
    service: ChatService,
    app_service: AppService,
    app_id: UUID,
) -> None:
    other_app_id = await app_service.create_from_prompt("список покупок", None)
    message = await service.add_message(app_id, "assistant", "вот предложение", build_template_document("x", None))

    with pytest.raises(ChatMessageNotFound):
        await service.record_decision(other_app_id, message.id, True)


async def test_list_messages_returns_chronological_order(
    service: ChatService,
    app_id: UUID,
) -> None:
    first = await service.add_message(app_id, "user", "первое")
    second = await service.add_message(app_id, "assistant", "второе")
    third = await service.add_message(app_id, "user", "третье")

    messages = await service.list_messages(app_id)

    assert [message.id for message in messages] == [first.id, second.id, third.id]
    assert [message.content for message in messages] == ["первое", "второе", "третье"]


async def test_send_message_commits_the_user_message_before_enqueuing_the_turn(
    service: ChatService,
    app_id: UUID,
    events: list[str],
) -> None:
    await service.send_message(app_id, "добавь экран настроек")

    assert events == ["commit", "enqueue"]


async def test_send_message_does_not_enqueue_the_turn_when_the_commit_fails(
    chat_repository: InMemoryChatRepository,
    app_service: AppService,
    app_id: UUID,
    events: list[str],
    task_queue: InMemoryTaskQueue,
) -> None:
    service = ChatService(chat_repository, app_service, FailingTransaction(events), task_queue)

    with pytest.raises(RuntimeError):
        await service.send_message(app_id, "добавь экран настроек")

    assert events == ["commit"]
    assert task_queue.jobs == []


async def test_send_message_writes_the_user_message_into_history(
    service: ChatService,
    app_id: UUID,
) -> None:
    await service.send_message(app_id, "добавь экран настроек")

    messages = await service.list_messages(app_id)
    assert [(message.role, message.content) for message in messages] == [("user", "добавь экран настроек")]
    assert messages[0].proposed_document is None
    assert messages[0].accepted is None


async def test_send_message_enqueues_chat_turn_with_a_fresh_task_id_and_the_created_message_id(
    service: ChatService,
    app_id: UUID,
    task_queue: InMemoryTaskQueue,
) -> None:
    task_id = await service.send_message(app_id, "добавь экран настроек")

    messages = await service.list_messages(app_id)
    assert len(task_queue.jobs) == 1
    job = task_queue.jobs[0]
    assert job.job_name == CHAT_TURN_JOB
    assert job.job_id == task_id
    assert job.job_id != str(app_id)
    assert job.kwargs == {"app_id": str(app_id), "message_id": str(messages[0].id)}


async def test_build_context_cuts_the_history_at_the_anchor_message(
    service: ChatService,
    app_id: UUID,
) -> None:
    first = await service.add_message(app_id, "user", "первое")
    await service.add_message(app_id, "assistant", "ответ на первое")
    second = await service.add_message(app_id, "user", "второе")
    await service.add_message(app_id, "user", "третье")

    _, history = await service.build_context(app_id, second.id)
    assert [message.content for message in history] == ["первое", "ответ на первое", "второе"]

    _, earlier = await service.build_context(app_id, first.id)
    assert [message.content for message in earlier] == ["первое"]


async def test_build_context_keeps_only_the_last_messages_of_the_window(
    service: ChatService,
    app_id: UUID,
) -> None:
    total = CONTEXT_HISTORY_LIMIT + 5
    for index in range(total):
        anchor = await service.add_message(app_id, "user", f"сообщение {index}")

    _, history = await service.build_context(app_id, anchor.id)

    assert [message.content for message in history] == [
        f"сообщение {index}" for index in range(total - CONTEXT_HISTORY_LIMIT, total)
    ]


async def test_build_context_returns_an_empty_history_for_an_unknown_anchor(
    service: ChatService,
    app_id: UUID,
) -> None:
    await service.add_message(app_id, "user", "первое")

    _, history = await service.build_context(app_id, uuid4())

    assert history == []


async def test_has_reply_is_true_only_after_an_answer_references_the_message(
    service: ChatService,
    app_id: UUID,
) -> None:
    question = await service.add_message(app_id, "user", "добавь экран настроек")
    assert await service.has_reply(question.id) is False

    await service.add_message(app_id, "assistant", "готово", None, question.id)

    assert await service.has_reply(question.id) is True


async def test_send_message_raises_not_found_for_unknown_app(
    service: ChatService,
    task_queue: InMemoryTaskQueue,
    transaction: InMemoryTransaction,
) -> None:
    with pytest.raises(AppNotFound):
        await service.send_message(uuid4(), "добавь экран настроек")

    assert transaction.commits == 0
    assert task_queue.jobs == []


async def test_send_message_raises_generation_in_progress_while_the_app_is_pending(
    service: ChatService,
    pending_app_id: UUID,
    task_queue: InMemoryTaskQueue,
    transaction: InMemoryTransaction,
) -> None:
    with pytest.raises(AppGenerationInProgress):
        await service.send_message(pending_app_id, "добавь экран настроек")

    assert transaction.commits == 0
    assert task_queue.jobs == []


async def test_send_message_without_a_task_queue_raises(
    chat_repository: InMemoryChatRepository,
    app_service: AppService,
    transaction: InMemoryTransaction,
    app_id: UUID,
) -> None:
    service = ChatService(chat_repository, app_service, transaction)

    with pytest.raises(ChatQueueNotConfiguredError):
        await service.send_message(app_id, "добавь экран настроек")

    assert await chat_repository.list_messages(app_id) == []
    assert transaction.commits == 0
