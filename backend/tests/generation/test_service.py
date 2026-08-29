import json

import pytest
from pydantic import ValidationError

from src.apps.schemas import AppDocument
from src.generation.exceptions import GenerationError
from src.generation.service import generate_document
from tests.generation.fake_llm_client import FakeLlmClient
from tests.generation.template_fixtures import build_template_document

MODEL = "test/model"
PROMPT = "трекер привычек и серии дней"

INCOMPLETE_ANSWER = '{"name": "Приложение"}'


def valid_answer(name: str = "Трекер привычек") -> str:
    document = build_template_document(PROMPT, name)
    return json.dumps(document.model_dump(mode="json", by_alias=True), ensure_ascii=False)


def validation_error_of(answer: str) -> str:
    try:
        AppDocument.model_validate(json.loads(answer))
    except ValidationError as error:
        return str(error)
    raise AssertionError("Ответ неожиданно прошёл валидацию документа")


async def test_generate_document_returns_validated_document() -> None:
    client = FakeLlmClient([valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert document.name == "Трекер привычек"
    assert document.screens != []
    assert len(client.calls) == 1


async def test_generate_document_passes_app_document_schema() -> None:
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert client.schemas[0] == AppDocument.model_json_schema(by_alias=True)


async def test_generate_document_accepts_answer_wrapped_in_code_fence() -> None:
    client = FakeLlmClient([f"```json\n{valid_answer()}\n```"])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert document.screens != []


async def test_generate_document_overwrites_prompt_and_timestamps() -> None:
    client = FakeLlmClient([valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert document.prompt == PROMPT
    assert document.created_at == document.updated_at
    assert document.created_at != ""


async def test_generate_document_uses_given_name() -> None:
    client = FakeLlmClient([valid_answer()])

    document = await generate_document(PROMPT, "Мои привычки", client=client, model=MODEL, max_attempts=3)

    assert document.name == "Мои привычки"


async def test_generate_document_retries_after_invalid_answer() -> None:
    client = FakeLlmClient(["совсем не json", valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert document.screens != []
    assert len(client.calls) == 2


async def test_generate_document_feeds_invalid_answer_back_to_the_model() -> None:
    client = FakeLlmClient([INCOMPLETE_ANSWER, valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    retry_messages = client.calls[1]
    assert retry_messages[:2] == client.calls[0]
    assert retry_messages[2] == {"role": "assistant", "content": INCOMPLETE_ANSWER}
    assert "screens" in retry_messages[3]["content"]


async def test_generate_document_puts_the_exact_validation_error_into_the_dialog() -> None:
    client = FakeLlmClient([INCOMPLETE_ANSWER, valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert validation_error_of(INCOMPLETE_ANSWER) in client.calls[1][3]["content"]


async def test_generate_document_keeps_the_whole_dialog_across_retries() -> None:
    client = FakeLlmClient([INCOMPLETE_ANSWER, "совсем не json", valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert len(client.calls[1]) == len(client.calls[0]) + 2
    assert len(client.calls[2]) == len(client.calls[0]) + 4
    assert client.calls[2][:4] == client.calls[1]
    assert client.calls[2][4] == {"role": "assistant", "content": "совсем не json"}


async def test_generate_document_fails_after_max_attempts() -> None:
    client = FakeLlmClient(["не json", "тоже не json", "и это не json"])

    with pytest.raises(GenerationError):
        await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=3)

    assert len(client.calls) == 3


@pytest.mark.parametrize("max_attempts", [1, 2, 3, 5])
async def test_generate_document_spends_exactly_max_attempts(max_attempts: int) -> None:
    client = FakeLlmClient(["не json"] * max_attempts)

    with pytest.raises(GenerationError):
        await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=max_attempts)

    assert len(client.calls) == max_attempts


@pytest.mark.parametrize("max_attempts", [1, 2, 3, 5])
async def test_generate_document_still_succeeds_on_the_last_allowed_attempt(max_attempts: int) -> None:
    client = FakeLlmClient([*["не json"] * (max_attempts - 1), valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=max_attempts)

    assert document.screens != []
    assert len(client.calls) == max_attempts


async def test_generate_document_reports_the_last_validation_error() -> None:
    client = FakeLlmClient(["не json", INCOMPLETE_ANSWER])

    with pytest.raises(GenerationError) as error:
        await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=2)

    assert validation_error_of(INCOMPLETE_ANSWER) in error.value.message
    assert "2 попыток" in error.value.message


async def test_generate_document_never_falls_back_to_a_template() -> None:
    client = FakeLlmClient(["не json"])

    with pytest.raises(GenerationError) as error:
        await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=1)

    assert "RouterAI" in error.value.message
