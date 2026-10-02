from uuid import UUID, uuid4

import pytest

from src.apps.exceptions import AppGenerationInProgress, AppNotFound
from src.apps.schemas import AppDocument
from src.apps.service import AppService
from src.chat.exceptions import ChatMessageNotFound, ChatQueueNotConfiguredError, MessageNotDecidable
from src.chat.prompt import DOCUMENT_REQUEST_PROBLEM
from src.chat.schemas import ChatTurnResponse
from src.chat.service import CONTEXT_HISTORY_LIMIT, ChatService, check_chat_turn
from src.generation.structured_output import generate_structured
from src.queue.jobs import CHAT_TURN_JOB
from tests.apps.in_memory_repository import InMemoryAppRepository
from tests.chat.in_memory_repository import InMemoryChatRepository
from tests.generation.fake_llm_client import FakeLlmClient
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


@pytest.mark.parametrize(
    "reply",
    [
        "Пришлите, пожалуйста, текущий документ экрана — я заменю текст кнопки «Отправить» на «Записаться».",
        "Пожалуйста, пришлите текущий JSON экрана, в котором нужно поменять текст кнопки «Отправить» на «Записаться».",
        "Ошибка: не найден документ для изменения. Пожалуйста, предоставьте AppDocument.",
        "Пожалуйста, предоставьте документ, в котором нужно заменить текст кнопки. Документа в текущем контексте нет.",
        "Уточните, на каком экране заменить текст кнопки — в текущем диалоге пока нет ни одного сгенерированного макета.",
        "Please send me the current app document so I can change the button text.",
        "Пожалуйста, прикрепите текущий дизайн-документ (JSON), чтобы я нашёл кнопку «Отправить».",
        "Нет доступа к текущему документу приложения в этом диалоге, в переписке документа не видно.",
        "Чтобы изменить текст кнопки, мне нужен текущий документ приложения. Пожалуйста, отправьте.",
    ],
)
def test_check_chat_turn_rejects_a_reply_that_asks_for_the_document(reply: str) -> None:
    with pytest.raises(ValueError, match="уже передан тебе целиком") as error:
        check_chat_turn(ChatTurnResponse(reply=reply, document=None))

    assert str(error.value) == DOCUMENT_REQUEST_PROBLEM


@pytest.mark.parametrize(
    "reply",
    [
        "Какую именно кнопку поменять — «Отправить» на экране заявки или «Новая заявка» на экране готово?",
        "Sure! Which button do you mean — “Отправить” on the form screen, or “Новая заявка” on the success screen?",
        "Пожалуйста, уточните, на каком экране нужно изменить кнопку. Пришлите название экрана, и я обновлю документ.",
        "Экранов в приложении два: «Заявка» и «Готово». Кнопка «Отправить» ведёт на экран «Готово».",
        "Чтобы выложить приложение, нажмите «Экспорт» — скачается zip-архив Expo-проекта.",
        "Сейчас в документе нет экрана настроек — добавить такой экран?",
        "Я не вижу в документе экрана настроек — добавить экран настроек?",
        "Добавить на экран входа кнопку «Отправьте код»?",
    ],
)
def test_check_chat_turn_accepts_a_conversational_reply_without_a_document(reply: str) -> None:
    check_chat_turn(ChatTurnResponse(reply=reply, document=None))


def test_check_chat_turn_does_not_apply_the_document_request_rule_when_a_document_is_proposed() -> None:
    document = build_template_document("форма заявки", None)

    check_chat_turn(ChatTurnResponse(reply="Готово. Пришлите следующий документ, если нужно ещё.", document=document))


def legacy_slash_start_document() -> AppDocument:
    document = build_template_document("трекер привычек", None)
    legacy = document.model_dump_json(by_alias=True, exclude_none=True).replace('"route":"index"', '"route":"/"')
    return AppDocument.model_validate_json(legacy)


def rename_start_screen_only(document: AppDocument) -> AppDocument:
    screens = [
        screen.model_copy(update={"route": "index"}) if screen.route == "/" else screen for screen in document.screens
    ]
    return document.model_copy(update={"screens": screens})


def rename_start_route_everywhere(document: AppDocument) -> AppDocument:
    dumped = document.model_dump_json(by_alias=True, exclude_none=True).replace('"route":"/"', '"route":"index"')
    return AppDocument.model_validate_json(dumped)


def test_check_chat_turn_rejects_a_navigate_left_pointing_at_the_renamed_start_route() -> None:
    renamed = rename_start_screen_only(legacy_slash_start_document())

    with pytest.raises(ValueError) as error:
        check_chat_turn(ChatTurnResponse(reply="Готово", document=renamed))

    message = str(error.value)
    assert "ведёт на `/`, среди экранов такого `route` нет" in message
    assert "на экране `progress`" in message


def test_check_chat_turn_accepts_the_start_route_renamed_together_with_its_navigate_targets() -> None:
    renamed = rename_start_route_everywhere(legacy_slash_start_document())

    check_chat_turn(ChatTurnResponse(reply="Готово", document=renamed))


async def test_chat_turn_retries_until_the_dangling_navigate_is_fixed() -> None:
    legacy = legacy_slash_start_document()
    dangling = ChatTurnResponse(reply="Готово", document=rename_start_screen_only(legacy))
    fixed = ChatTurnResponse(reply="Готово", document=rename_start_route_everywhere(legacy))
    client = FakeLlmClient([dangling.model_dump_json(by_alias=True), fixed.model_dump_json(by_alias=True)])

    result = await generate_structured(
        [{"role": "user", "content": "переименуй стартовый экран"}],
        client=client,
        model="m",
        schema_name="ChatTurnResponse",
        schema={},
        target_model=ChatTurnResponse,
        max_attempts=3,
        check=check_chat_turn,
    )

    assert result == fixed
    assert len(client.calls) == 2
    assert "ведёт на `/`" in client.calls[1][-1]["content"]
