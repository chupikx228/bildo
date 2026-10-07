import json

import pytest
from pydantic import ValidationError

from src.chat.schemas import ChatTurnResponse
from tests.generation.template_fixtures import build_template_document


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


def test_chat_turn_response_with_omitted_optional_fields_validates_like_one_with_explicit_nulls() -> None:
    document = build_template_document("трекер привычек", None).model_dump(mode="json", by_alias=True)
    with_nulls = json.loads(json.dumps(document))
    root = with_nulls["screens"][0]["root"]
    root["layout"]["zIndex"] = None
    root.setdefault("style", {}).update({"shadow": None, "backgroundGradient": None})
    with_nulls["slug"] = None
    assert "zIndex" not in document["screens"][0]["root"]["layout"]
    assert "shadow" not in document["screens"][0]["root"].get("style", {})

    omitted = ChatTurnResponse.model_validate({"reply": "готово", "document": document})
    explicit = ChatTurnResponse.model_validate({"reply": "готово", "document": with_nulls, "edited": False})

    assert omitted.edited is False
    assert omitted.document is not None
    assert explicit.document is not None
    assert omitted.document.model_dump(mode="json", by_alias=True, exclude_none=True) == (
        explicit.document.model_dump(mode="json", by_alias=True, exclude_none=True)
    )


def test_chat_turn_response_without_document_and_edited_equals_one_with_explicit_nulls() -> None:
    omitted = ChatTurnResponse.model_validate({"reply": "пока ни одного"})
    explicit = ChatTurnResponse.model_validate({"reply": "пока ни одного", "document": None, "edited": False})

    assert omitted == explicit
    assert omitted.document is None
    assert omitted.edited is False
