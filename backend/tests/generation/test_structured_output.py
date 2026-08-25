import json
from dataclasses import dataclass

import pytest
from pydantic import BaseModel, ValidationError

from src.apps.schemas import AppDocument
from src.chat.prompt import RESPONSE_SCHEMA as CHAT_RESPONSE_SCHEMA
from src.chat.prompt import SCHEMA_NAME as CHAT_SCHEMA_NAME
from src.chat.schemas import ChatTurnResponse
from src.generation.exceptions import GenerationError
from src.generation.llm_client import ChatMessage, JsonSchema
from src.generation.prompt import SCHEMA_NAME as DOCUMENT_SCHEMA_NAME
from src.generation.prompt import app_document_schema
from src.generation.structured_output import generate_structured
from tests.generation.fake_llm_client import FakeLlmClient
from tests.generation.template_fixtures import build_template_document

PROMPT = "трекер привычек и серии дней"

MESSAGES: list[ChatMessage] = [
    ChatMessage(role="system", content="системный промпт"),
    ChatMessage(role="user", content=PROMPT),
]


@dataclass(frozen=True)
class Case:
    target_model: type[BaseModel]
    schema_name: str
    schema: JsonSchema
    subject: str
    valid_answer: str
    invalid_answer: str


def document_answer() -> str:
    document = build_template_document(PROMPT, "Трекер привычек")
    return json.dumps(document.model_dump(mode="json", by_alias=True), ensure_ascii=False)


def chat_answer() -> str:
    document = build_template_document(PROMPT, "Трекер привычек")
    payload = {"reply": "добавил экран настроек", "document": document.model_dump(mode="json", by_alias=True)}
    return json.dumps(payload, ensure_ascii=False)


DOCUMENT_CASE = Case(
    target_model=AppDocument,
    schema_name=DOCUMENT_SCHEMA_NAME,
    schema=app_document_schema(),
    subject="документ",
    valid_answer=document_answer(),
    invalid_answer='{"name": "Приложение"}',
)

CHAT_CASE = Case(
    target_model=ChatTurnResponse,
    schema_name=CHAT_SCHEMA_NAME,
    schema=CHAT_RESPONSE_SCHEMA,
    subject="ответ ассистента",
    valid_answer=chat_answer(),
    invalid_answer='{"document": null}',
)

CASES = [DOCUMENT_CASE, CHAT_CASE]
CASE_IDS = ["AppDocument", "ChatTurnResponse"]


async def run(case: Case, client: FakeLlmClient, max_attempts: int = 3) -> BaseModel:
    return await generate_structured(
        MESSAGES,
        client=client,
        schema_name=case.schema_name,
        schema=case.schema,
        target_model=case.target_model,
        max_attempts=max_attempts,
        subject=case.subject,
    )


def validation_error_of(case: Case, answer: str) -> str:
    try:
        case.target_model.model_validate(json.loads(answer))
    except ValidationError as error:
        return str(error)
    raise AssertionError("Ответ неожиданно прошёл валидацию")


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_returns_the_target_model_on_the_first_attempt(case: Case) -> None:
    client = FakeLlmClient([case.valid_answer])

    result = await run(case, client)

    assert isinstance(result, case.target_model)
    assert result == case.target_model.model_validate(json.loads(case.valid_answer))
    assert len(client.calls) == 1


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_sends_the_given_messages_unchanged(case: Case) -> None:
    client = FakeLlmClient([case.valid_answer])

    await run(case, client)

    assert client.calls[0] == MESSAGES


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_passes_the_schema_of_the_target_model(case: Case) -> None:
    client = FakeLlmClient([case.valid_answer])

    await run(case, client)

    assert client.schemas[0] == case.target_model.model_json_schema(by_alias=True)


async def test_generate_structured_passes_a_different_schema_for_each_target_model() -> None:
    document_client = FakeLlmClient([DOCUMENT_CASE.valid_answer])
    chat_client = FakeLlmClient([CHAT_CASE.valid_answer])

    await run(DOCUMENT_CASE, document_client)
    await run(CHAT_CASE, chat_client)

    assert document_client.schemas[0] != chat_client.schemas[0]


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_accepts_an_answer_wrapped_in_a_code_fence(case: Case) -> None:
    client = FakeLlmClient([f"```json\n{case.valid_answer}\n```"])

    result = await run(case, client)

    assert result == case.target_model.model_validate(json.loads(case.valid_answer))


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_retries_after_an_invalid_answer(case: Case) -> None:
    client = FakeLlmClient([case.invalid_answer, case.valid_answer])

    result = await run(case, client)

    assert result == case.target_model.model_validate(json.loads(case.valid_answer))
    assert len(client.calls) == 2


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_feeds_the_invalid_answer_back_to_the_model(case: Case) -> None:
    client = FakeLlmClient([case.invalid_answer, case.valid_answer])

    await run(case, client)

    retry_messages = client.calls[1]
    assert retry_messages[: len(MESSAGES)] == MESSAGES
    assert retry_messages[len(MESSAGES)] == {"role": "assistant", "content": case.invalid_answer}
    assert retry_messages[len(MESSAGES) + 1]["role"] == "user"


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_puts_the_exact_validation_error_into_the_dialog(case: Case) -> None:
    client = FakeLlmClient([case.invalid_answer, case.valid_answer])

    await run(case, client)

    assert validation_error_of(case, case.invalid_answer) in client.calls[1][len(MESSAGES) + 1]["content"]


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_keeps_the_whole_dialog_across_retries(case: Case) -> None:
    client = FakeLlmClient([case.invalid_answer, "совсем не json", case.valid_answer])

    await run(case, client)

    assert len(client.calls[1]) == len(MESSAGES) + 2
    assert len(client.calls[2]) == len(MESSAGES) + 4
    assert client.calls[2][: len(client.calls[1])] == client.calls[1]
    assert client.calls[2][len(MESSAGES) + 2] == {"role": "assistant", "content": "совсем не json"}


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_fails_after_max_attempts_are_spent(case: Case) -> None:
    client = FakeLlmClient([case.invalid_answer] * 3)

    with pytest.raises(GenerationError) as error:
        await run(case, client)

    assert len(client.calls) == 3
    assert case.subject in error.value.message
    assert "3 попыток" in error.value.message


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_reports_the_last_validation_error(case: Case) -> None:
    client = FakeLlmClient(["совсем не json", case.invalid_answer])

    with pytest.raises(GenerationError) as error:
        await run(case, client, max_attempts=2)

    assert validation_error_of(case, case.invalid_answer) in error.value.message


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
@pytest.mark.parametrize("max_attempts", [1, 2, 5])
async def test_generate_structured_spends_exactly_max_attempts(case: Case, max_attempts: int) -> None:
    client = FakeLlmClient([case.invalid_answer] * max_attempts)

    with pytest.raises(GenerationError):
        await run(case, client, max_attempts=max_attempts)

    assert len(client.calls) == max_attempts


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
@pytest.mark.parametrize("max_attempts", [1, 2, 5])
async def test_generate_structured_still_succeeds_on_the_last_allowed_attempt(case: Case, max_attempts: int) -> None:
    client = FakeLlmClient([*[case.invalid_answer] * (max_attempts - 1), case.valid_answer])

    result = await run(case, client, max_attempts=max_attempts)

    assert result == case.target_model.model_validate(json.loads(case.valid_answer))
    assert len(client.calls) == max_attempts


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
async def test_generate_structured_propagates_client_errors_without_retrying(case: Case) -> None:
    client = FakeLlmClient([GenerationError("RouterAI отклонил запрос генерации: 400")])

    with pytest.raises(GenerationError) as error:
        await run(case, client)

    assert len(client.calls) == 1
    assert "RouterAI отклонил запрос генерации" in error.value.message
