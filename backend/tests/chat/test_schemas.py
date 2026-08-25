import pytest
from pydantic import ValidationError

from src.chat.schemas import ChatTurnResponse


def test_chat_turn_response_strips_the_reply() -> None:
    response = ChatTurnResponse.model_validate({"reply": "  готово, добавил  \n"})

    assert response.reply == "готово, добавил"
    assert response.document is None


@pytest.mark.parametrize("reply", ["", "   ", "\n\t "])
def test_chat_turn_response_rejects_a_blank_reply(reply: str) -> None:
    with pytest.raises(ValidationError):
        ChatTurnResponse.model_validate({"reply": reply})


def test_chat_turn_response_schema_requires_a_non_empty_reply() -> None:
    assert ChatTurnResponse.model_json_schema(by_alias=True)["properties"]["reply"]["minLength"] == 1
