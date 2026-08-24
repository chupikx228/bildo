from uuid import UUID, uuid4

import pytest

from src.apps.exceptions import AppNotFound
from src.apps.service import AppService
from src.chat.exceptions import ChatMessageNotFound, MessageNotDecidable
from src.chat.service import ChatService
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.chat.in_memory_repository import InMemoryChatRepository
from tests.generation.template_fixtures import build_template_document
from tests.in_memory_task_queue import InMemoryTaskQueue


@pytest.fixture
def app_repository() -> InMemoryAppRepository:
    return InMemoryAppRepository()


@pytest.fixture
def app_service(app_repository: InMemoryAppRepository) -> AppService:
    return AppService(app_repository, InMemoryTaskQueue())


@pytest.fixture
def chat_repository() -> InMemoryChatRepository:
    return InMemoryChatRepository()


@pytest.fixture
def service(chat_repository: InMemoryChatRepository, app_service: AppService) -> ChatService:
    return ChatService(chat_repository, app_service)


@pytest.fixture
async def app_id(app_service: AppService) -> UUID:
    return await app_service.create_from_prompt("трекер привычек", None)


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
