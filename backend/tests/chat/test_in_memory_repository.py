from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from src.chat.models import REPLY_UNIQUE_CONSTRAINT
from src.chat.repository import is_duplicate_reply_violation
from tests.chat.in_memory_repository import InMemoryChatRepository


async def test_a_message_cannot_be_answered_twice() -> None:
    app_id = uuid4()
    repository = InMemoryChatRepository()
    question = await repository.create_message(app_id, "user", "добавь экран настроек")
    answer = await repository.create_message(app_id, "assistant", "готово", None, question.id)

    with pytest.raises(IntegrityError) as raised:
        await repository.create_message(app_id, "assistant", "готово ещё раз", None, question.id)

    cause = raised.value.orig.__cause__ if raised.value.orig is not None else None
    assert getattr(cause, "constraint_name", None) == REPLY_UNIQUE_CONSTRAINT
    assert is_duplicate_reply_violation(raised.value) is True
    assert [message.id for message in await repository.list_messages(app_id)] == [question.id, answer.id]


async def test_different_messages_can_each_have_their_own_answer() -> None:
    app_id = uuid4()
    repository = InMemoryChatRepository()
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
