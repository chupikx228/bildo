from collections.abc import AsyncIterator
from datetime import datetime
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.apps.repository import SqlAlchemyAppRepository
from src.chat.models import REPLY_FOREIGN_KEY_CONSTRAINT, REPLY_UNIQUE_CONSTRAINT, ChatMessage
from src.chat.repository import SqlAlchemyChatRepository, is_duplicate_reply_violation
from tests.apps.test_repository import build_document
from tests.chat.in_memory_repository import InMemoryChatRepository
from tests.conftest import requires_docker

pytestmark = [pytest.mark.integration, requires_docker]

COLLIDING_CREATED_AT = datetime(2026, 8, 24, 12, 0, 0)
COLLIDING_CONTENTS = ["первое", "второе", "третье", "четвёртое"]


def descending_id(index: int) -> UUID:
    return UUID(int=len(COLLIDING_CONTENTS) - index)


async def seed_colliding_sql_messages(
    repository: SqlAlchemyChatRepository,
    session: AsyncSession,
    app_id: UUID,
) -> list[UUID]:
    created = [await repository.create_message(app_id, "user", content) for content in COLLIDING_CONTENTS]
    for index, message in enumerate(created):
        await session.execute(
            update(ChatMessage)
            .where(ChatMessage.id == message.id)
            .values(id=descending_id(index), created_at=COLLIDING_CREATED_AT)
            .execution_options(synchronize_session=False),
        )
    session.expunge_all()
    return [descending_id(index) for index in range(len(COLLIDING_CONTENTS))]


async def seed_colliding_memory_messages(repository: InMemoryChatRepository, app_id: UUID) -> list[UUID]:
    created = [await repository.create_message(app_id, "user", content) for content in COLLIDING_CONTENTS]
    for index, message in enumerate(created):
        message.id = descending_id(index)
        message.created_at = COLLIDING_CREATED_AT
    return [message.id for message in created]


@pytest_asyncio.fixture
async def session(db_session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with db_session_factory() as session:
        yield session


@pytest.fixture
def repository(session: AsyncSession) -> SqlAlchemyChatRepository:
    return SqlAlchemyChatRepository(session)


@pytest_asyncio.fixture
async def app_id(session: AsyncSession) -> UUID:
    document = build_document()
    app = await SqlAlchemyAppRepository(session).create(document.name, document.prompt, document, "ready", None)
    return app.id


async def test_list_messages_returns_chronological_order(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    first = await repository.create_message(app_id, "user", "первое")
    second = await repository.create_message(app_id, "assistant", "второе")
    third = await repository.create_message(app_id, "user", "третье")

    messages = await repository.list_messages(app_id)

    assert [message.id for message in messages] == [first.id, second.id, third.id]


async def test_list_messages_ignores_other_apps(
    repository: SqlAlchemyChatRepository,
    session: AsyncSession,
    app_id: UUID,
) -> None:
    other = build_document()
    other_app = await SqlAlchemyAppRepository(session).create(other.name, other.prompt, other, "ready", None)
    await repository.create_message(app_id, "user", "своё")
    await repository.create_message(other_app.id, "user", "чужое")

    assert [message.content for message in await repository.list_messages(app_id)] == ["своё"]


async def test_list_messages_up_to_cuts_the_history_at_the_anchor(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    await repository.create_message(app_id, "user", "первое")
    anchor = await repository.create_message(app_id, "user", "второе")
    await repository.create_message(app_id, "user", "третье")

    messages = await repository.list_messages_up_to(app_id, anchor.id)

    assert [message.content for message in messages] == ["первое", "второе"]


async def test_list_messages_up_to_returns_nothing_for_an_unknown_anchor(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    await repository.create_message(app_id, "user", "первое")

    assert await repository.list_messages_up_to(app_id, uuid4()) == []


async def test_list_messages_up_to_returns_nothing_for_an_anchor_of_another_app(
    repository: SqlAlchemyChatRepository,
    session: AsyncSession,
    app_id: UUID,
) -> None:
    other = build_document()
    other_app = await SqlAlchemyAppRepository(session).create(other.name, other.prompt, other, "ready", None)
    foreign = await repository.create_message(other_app.id, "user", "чужое")
    await repository.create_message(app_id, "user", "своё")

    assert await repository.list_messages_up_to(app_id, foreign.id) == []


async def test_get_reply_to_finds_the_answer_of_a_message(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    question = await repository.create_message(app_id, "user", "добавь экран настроек")
    assert await repository.get_reply_to(question.id) is None

    answer = await repository.create_message(app_id, "assistant", "готово", None, question.id)

    found = await repository.get_reply_to(question.id)
    assert found is not None
    assert found.id == answer.id


async def test_a_message_cannot_be_answered_twice(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    question = await repository.create_message(app_id, "user", "добавь экран настроек")
    await repository.create_message(app_id, "assistant", "готово", None, question.id)

    with pytest.raises(IntegrityError):
        await repository.create_message(app_id, "assistant", "готово ещё раз", None, question.id)


async def test_a_second_answer_is_recognised_as_the_reply_uniqueness_violation(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    question = await repository.create_message(app_id, "user", "добавь экран настроек")
    await repository.create_message(app_id, "assistant", "готово", None, question.id)

    with pytest.raises(IntegrityError) as raised:
        await repository.create_message(app_id, "assistant", "готово ещё раз", None, question.id)

    cause = raised.value.orig.__cause__ if raised.value.orig is not None else None
    assert getattr(cause, "constraint_name", None) == REPLY_UNIQUE_CONSTRAINT
    assert is_duplicate_reply_violation(raised.value) is True


async def test_a_reply_cannot_point_at_a_message_of_another_app(
    repository: SqlAlchemyChatRepository,
    session: AsyncSession,
    app_id: UUID,
) -> None:
    other = build_document()
    other_app = await SqlAlchemyAppRepository(session).create(other.name, other.prompt, other, "ready", None)
    foreign = await repository.create_message(other_app.id, "user", "чужой вопрос")

    with pytest.raises(IntegrityError) as raised:
        await repository.create_message(app_id, "assistant", "ответ на чужое", None, foreign.id)

    cause = raised.value.orig.__cause__ if raised.value.orig is not None else None
    assert getattr(cause, "constraint_name", None) == REPLY_FOREIGN_KEY_CONSTRAINT
    assert is_duplicate_reply_violation(raised.value) is False


async def test_the_in_memory_repository_rejects_a_reply_to_another_app_the_same_way(
    app_id: UUID,
) -> None:
    memory = InMemoryChatRepository()
    foreign = await memory.create_message(uuid4(), "user", "чужой вопрос")

    with pytest.raises(IntegrityError) as raised:
        await memory.create_message(app_id, "assistant", "ответ на чужое", None, foreign.id)

    cause = raised.value.orig.__cause__ if raised.value.orig is not None else None
    assert getattr(cause, "constraint_name", None) == REPLY_FOREIGN_KEY_CONSTRAINT
    assert is_duplicate_reply_violation(raised.value) is False


async def test_another_constraint_violation_is_not_taken_for_a_duplicate_reply(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    with pytest.raises(IntegrityError) as raised:
        await repository.create_message(app_id, "assistant", "ответ в пустоту", None, uuid4())

    assert is_duplicate_reply_violation(raised.value) is False


async def test_different_messages_can_each_have_their_own_answer(
    repository: SqlAlchemyChatRepository,
    app_id: UUID,
) -> None:
    first = await repository.create_message(app_id, "user", "первое")
    second = await repository.create_message(app_id, "user", "второе")

    await repository.create_message(app_id, "assistant", "ответ на первое", None, first.id)
    await repository.create_message(app_id, "assistant", "ответ на второе", None, second.id)

    assert [message.in_reply_to_id for message in await repository.list_messages(app_id)] == [
        None,
        None,
        first.id,
        second.id,
    ]


async def test_both_repositories_order_by_insertion_when_created_at_collides(
    repository: SqlAlchemyChatRepository,
    session: AsyncSession,
    app_id: UUID,
) -> None:
    expected_ids = await seed_colliding_sql_messages(repository, session, app_id)
    memory = InMemoryChatRepository()
    assert await seed_colliding_memory_messages(memory, app_id) == expected_ids

    stored = await repository.list_messages(app_id)
    remembered = await memory.list_messages(app_id)

    assert {message.created_at for message in stored} == {COLLIDING_CREATED_AT}
    assert [message.content for message in stored] == COLLIDING_CONTENTS
    assert [message.content for message in remembered] == COLLIDING_CONTENTS
    assert [message.id for message in stored] == expected_ids
    assert [message.id for message in remembered] == expected_ids


async def test_both_repositories_cut_the_history_by_insertion_when_created_at_collides(
    repository: SqlAlchemyChatRepository,
    session: AsyncSession,
    app_id: UUID,
) -> None:
    expected_ids = await seed_colliding_sql_messages(repository, session, app_id)
    memory = InMemoryChatRepository()
    await seed_colliding_memory_messages(memory, app_id)
    anchor_id = expected_ids[1]

    stored = await repository.list_messages_up_to(app_id, anchor_id)
    remembered = await memory.list_messages_up_to(app_id, anchor_id)

    assert [message.content for message in stored] == COLLIDING_CONTENTS[:2]
    assert [message.content for message in remembered] == COLLIDING_CONTENTS[:2]
    assert [message.id for message in stored] == expected_ids[:2]
    assert [message.id for message in remembered] == expected_ids[:2]
