import json

import pytest
from pydantic import ValidationError

from src.apps.schemas import AppDocument
from src.generation.exceptions import GenerationError
from src.generation.json_schema import to_strict_json_schema
from src.generation.prompt import build_system_prompt
from src.generation.service import check_navigation, generate_document
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

    assert client.schemas[0] == to_strict_json_schema(AppDocument.model_json_schema(by_alias=True))


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
    client = FakeLlmClient([f"не json {attempt}" for attempt in range(max_attempts)])

    with pytest.raises(GenerationError):
        await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=max_attempts)

    assert len(client.calls) == max_attempts


@pytest.mark.parametrize("max_attempts", [1, 2, 3, 5])
async def test_generate_document_still_succeeds_on_the_last_allowed_attempt(max_attempts: int) -> None:
    client = FakeLlmClient([*[f"не json {attempt}" for attempt in range(max_attempts - 1)], valid_answer()])

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


async def test_generate_document_asks_for_the_brief_instead_of_the_prompt() -> None:
    brief = "Трекер привычек для студентов в сессию, палитра #F3F6F4 и #1D3B2F"
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=1, brief=brief)

    request = client.calls[0][-1]["content"]
    assert brief in request
    assert PROMPT not in request


async def test_generate_document_keeps_the_raw_prompt_on_the_document_when_given_a_brief() -> None:
    client = FakeLlmClient([valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=1, brief="бриф")

    assert document.prompt == PROMPT


def answer_with_routes_named_by_meaning() -> str:
    document = build_template_document(PROMPT, "Трекер привычек")
    screens = [
        screen.model_copy(update={"id": "today", "route": "today"}) if screen.route == "index" else screen
        for screen in document.screens
    ]
    roots = ["today" if root == "index" else root for root in document.navigation.roots]
    navigation = document.navigation.model_copy(update={"roots": roots})
    renamed = document.model_copy(update={"screens": screens, "navigation": navigation})
    return json.dumps(renamed.model_dump(mode="json", by_alias=True), ensure_ascii=False)


async def test_generate_document_retries_a_brief_that_named_the_start_screen_by_meaning() -> None:
    client = FakeLlmClient([answer_with_routes_named_by_meaning(), valid_answer()])

    document = await generate_document(
        PROMPT,
        None,
        client=client,
        model=MODEL,
        max_attempts=2,
        brief="Трекер привычек. Экраны: «Сегодня» — главный, «Прогресс» — статистика.",
    )

    assert "index" in [screen.route for screen in document.screens]
    assert len(client.calls) == 2
    retry = client.calls[1][-1]["content"]
    assert "`index`" in retry
    assert "today" in retry


async def test_generate_document_fails_when_the_start_screen_never_becomes_index() -> None:
    answers: list[str | Exception] = [answer_with_routes_named_by_meaning() for _ in range(2)]
    client = FakeLlmClient(answers)

    with pytest.raises(GenerationError) as error:
        await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=2)

    assert "`index`" in error.value.message


def test_check_navigation_accepts_a_document_with_an_index_route() -> None:
    check_navigation(build_template_document(PROMPT, None))


def test_check_navigation_rejects_empty_roots() -> None:
    document = build_template_document(PROMPT, None)
    document = document.model_copy(update={"navigation": document.navigation.model_copy(update={"roots": []})})

    with pytest.raises(ValueError) as error:
        check_navigation(document)

    assert "`navigation.roots` пуст" in str(error.value)


def test_check_navigation_rejects_roots_pointing_at_missing_routes() -> None:
    document = build_template_document(PROMPT, None)
    roots = [*document.navigation.roots, "settings"]
    document = document.model_copy(update={"navigation": document.navigation.model_copy(update={"roots": roots})})

    with pytest.raises(ValueError) as error:
        check_navigation(document)

    assert "несуществующие `route`: settings" in str(error.value)


async def test_generate_document_with_a_brief_sends_the_rules_only_prompt() -> None:
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=1, brief="бриф")

    assert client.calls[0][0]["content"] == build_system_prompt(has_brief=True)


async def test_generate_document_without_a_brief_sends_the_full_design_prompt() -> None:
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=1)

    assert client.calls[0][0]["content"] == build_system_prompt(has_brief=False)
