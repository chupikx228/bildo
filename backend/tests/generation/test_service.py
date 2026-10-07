import json

import pytest
from pydantic import ValidationError

from src.apps.schemas import AppComponentType, AppDocument, AppNodeLayout
from src.generation.exceptions import GenerationError
from src.generation.json_schema import to_strict_json_schema
from src.generation.prompt import app_document_schema, build_system_prompt
from src.generation.service import check_document, check_edited_document, generate_document
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


@pytest.mark.parametrize("template_prompt", ["habits", "social", "shop", "forms"])
def test_check_document_accepts_the_template_documents(template_prompt: str) -> None:
    check_document(build_template_document(template_prompt, None))


def test_check_document_rejects_empty_roots() -> None:
    document = build_template_document(PROMPT, None)
    document = document.model_copy(update={"navigation": document.navigation.model_copy(update={"roots": []})})

    with pytest.raises(ValueError) as error:
        check_document(document)

    assert "`navigation.roots` пуст" in str(error.value)


def test_check_document_rejects_roots_pointing_at_missing_screens() -> None:
    document = build_template_document(PROMPT, None)
    roots = [*document.navigation.roots, "settings"]
    document = document.model_copy(update={"navigation": document.navigation.model_copy(update={"roots": roots})})

    with pytest.raises(ValueError) as error:
        check_document(document)

    assert "`navigation.roots` ссылается на несуществующие `id` экранов: settings" in str(error.value)


def with_screen_ids_apart_from_routes(document: AppDocument, roots: str) -> AppDocument:
    screens = [screen.model_copy(update={"id": f"scr-{screen.route}"}) for screen in document.screens]
    root_values = [screen.id if roots == "ids" else screen.route for screen in screens]
    return document.model_copy(
        update={"screens": screens, "navigation": document.navigation.model_copy(update={"roots": root_values})}
    )


def test_check_document_accepts_roots_that_name_screen_ids_different_from_routes() -> None:
    check_document(with_screen_ids_apart_from_routes(build_template_document(PROMPT, None), "ids"))


def test_check_document_rejects_roots_that_name_routes_instead_of_screen_ids() -> None:
    document = with_screen_ids_apart_from_routes(build_template_document(PROMPT, None), "routes")

    with pytest.raises(ValueError) as error:
        check_document(document)

    message = str(error.value)
    assert "`navigation.roots` ссылается на несуществующие `id` экранов: index, progress" in message
    assert "перечисляет `id` экранов, их `route` туда не пишется" in message
    assert "`scr-index` (`route` `index`), `scr-progress` (`route` `progress`)" in message


def test_check_document_accepts_a_start_screen_whose_id_is_not_index() -> None:
    document = with_screen_ids_apart_from_routes(build_template_document(PROMPT, None), "ids")

    assert "index" not in [screen.id for screen in document.screens]
    check_document(document)


def with_index_root_layout(document: AppDocument, layout: AppNodeLayout | None) -> AppDocument:
    screens = [
        screen.model_copy(update={"root": screen.root.model_copy(update={"layout": layout})})
        if screen.route == "index"
        else screen
        for screen in document.screens
    ]
    return document.model_copy(update={"screens": screens})


def with_index_root_type(document: AppDocument, node_type: AppComponentType) -> AppDocument:
    screens = [
        screen.model_copy(update={"root": screen.root.model_copy(update={"type": node_type})})
        if screen.route == "index"
        else screen
        for screen in document.screens
    ]
    return document.model_copy(update={"screens": screens})


def dump(document: AppDocument) -> str:
    return json.dumps(document.model_dump(mode="json", by_alias=True), ensure_ascii=False)


def test_check_document_rejects_a_document_without_screens() -> None:
    document = build_template_document(PROMPT, None).model_copy(update={"screens": []})

    with pytest.raises(ValueError) as error:
        check_document(document)

    assert "экранов в документе 0, нужно от 2 до 5" in str(error.value)
    assert "нет ни одного экрана" in str(error.value)


def test_check_document_rejects_a_single_screen_document() -> None:
    document = build_template_document("blank", None)

    with pytest.raises(ValueError) as error:
        check_document(document)

    assert "экранов в документе 1, нужно от 2 до 5" in str(error.value)


def test_check_document_accepts_the_maximum_screen_count_boundary() -> None:
    document = build_template_document(PROMPT, None)
    extra = [
        screen.model_copy(update={"id": f"extra-{index}", "route": f"extra-{index}"})
        for index, screen in enumerate([document.screens[-1]] * 3)
    ]

    check_document(document.model_copy(update={"screens": [*document.screens, *extra]}))


@pytest.mark.parametrize(
    ("layout", "described"),
    [
        (AppNodeLayout(x=0, y=0, width=370, height=560), "0, 0, 370, 560"),
        (AppNodeLayout(x=0, y=0, width=390, height=844), "0, 0, 390, 844"),
        (AppNodeLayout(x=10, y=20, width=370, height=640), "10, 20, 370, 640"),
        (AppNodeLayout(x=0, y=0.5, width=370, height=640), "0, 0.5, 370, 640"),
    ],
)
def test_check_document_rejects_a_root_that_does_not_fill_the_scene(layout: AppNodeLayout, described: str) -> None:
    document = with_index_root_layout(build_template_document(PROMPT, None), layout)

    with pytest.raises(ValueError) as error:
        check_document(document)

    message = str(error.value)
    assert f"`layout` корня экрана `index` — {described}" in message
    assert "ровно 0, 0, 370, 640" in message


def test_check_document_rejects_a_root_without_layout() -> None:
    document = with_index_root_layout(build_template_document(PROMPT, None), None)

    with pytest.raises(ValueError) as error:
        check_document(document)

    assert "корень экрана `index` без `layout`" in str(error.value)


@pytest.mark.parametrize("node_type", ["ScrollView", "Text"])
def test_check_document_rejects_a_root_that_is_not_a_view(node_type: AppComponentType) -> None:
    document = with_index_root_type(build_template_document(PROMPT, None), node_type)

    with pytest.raises(ValueError) as error:
        check_document(document)

    assert f"корень экрана `index` — `{node_type}`, нужен `View`" in str(error.value)


def test_check_document_reports_every_problem_in_one_error() -> None:
    document = with_index_root_layout(
        build_template_document(PROMPT, None), AppNodeLayout(x=0, y=0, width=370, height=560)
    )
    document = document.model_copy(update={"navigation": document.navigation.model_copy(update={"roots": []})})

    with pytest.raises(ValueError) as error:
        check_document(document)

    message = str(error.value)
    assert "`navigation.roots` пуст" in message
    assert "`layout` корня экрана `index` — 0, 0, 370, 560" in message


def with_index_route(document: AppDocument, route: str) -> AppDocument:
    screens = [
        screen.model_copy(update={"route": route}) if screen.route == "index" else screen for screen in document.screens
    ]
    return document.model_copy(update={"screens": screens})


def test_check_document_asks_for_the_start_route_but_keeps_the_screen_id() -> None:
    document = with_index_route(build_template_document(PROMPT, None), "today")

    with pytest.raises(ValueError) as error:
        check_document(document)

    message = str(error.value)
    assert "`route` стартового экрана — буквально строка `index`" in message
    assert "`id` экрана не меняй" in message
    assert "`id` и `route` стартового экрана" not in message


def test_check_edited_document_accepts_a_single_screen_document() -> None:
    check_edited_document(build_template_document("blank", None))


@pytest.mark.parametrize("template_prompt", ["habits", "social", "shop", "forms"])
def test_check_edited_document_accepts_the_template_documents(template_prompt: str) -> None:
    check_edited_document(build_template_document(template_prompt, None))


def test_check_edited_document_rejects_a_document_without_the_index_route() -> None:
    document = with_index_route(build_template_document(PROMPT, None), "today")

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    message = str(error.value)
    assert "нет экрана, чей `route` равен `index`" in message
    assert "`route` стартового экрана — буквально строка `index`" in message
    assert "`id` и `route` стартового экрана" not in message


def test_check_edited_document_rejects_a_document_without_screens() -> None:
    document = build_template_document(PROMPT, None).model_copy(update={"screens": []})

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    message = str(error.value)
    assert "нет экрана, чей `route` равен `index`" in message
    assert "нет ни одного экрана" in message
    assert "нужно от 2 до 5" not in message


def test_check_edited_document_rejects_empty_roots() -> None:
    document = build_template_document(PROMPT, None)
    document = document.model_copy(update={"navigation": document.navigation.model_copy(update={"roots": []})})

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    assert "`navigation.roots` пуст" in str(error.value)


def test_check_edited_document_rejects_roots_that_name_routes_instead_of_screen_ids() -> None:
    document = with_screen_ids_apart_from_routes(build_template_document(PROMPT, None), "routes")

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    assert "`navigation.roots` ссылается на несуществующие `id` экранов: index, progress" in str(error.value)


def test_check_edited_document_rejects_roots_pointing_at_a_removed_screen() -> None:
    document = build_template_document(PROMPT, None)
    document = document.model_copy(update={"screens": [s for s in document.screens if s.route == "index"]})

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    assert "несуществующие `id` экранов: progress" in str(error.value)


def test_check_edited_document_accepts_roots_that_name_screen_ids_instead_of_routes() -> None:
    document = build_template_document(PROMPT, None)
    screens = [
        screen if screen.route == "index" else screen.model_copy(update={"id": f"scr-{screen.route}"})
        for screen in document.screens
    ]
    roots = [screen.id for screen in screens]
    document = document.model_copy(
        update={"screens": screens, "navigation": document.navigation.model_copy(update={"roots": roots})}
    )

    check_edited_document(document)


def test_check_edited_document_rejects_a_root_that_does_not_fill_the_scene() -> None:
    document = with_index_root_layout(
        build_template_document(PROMPT, None), AppNodeLayout(x=0, y=0, width=390, height=844)
    )

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    message = str(error.value)
    assert "`layout` корня экрана `index` — 0, 0, 390, 844" in message
    assert "ровно 0, 0, 370, 640" in message


def test_check_edited_document_rejects_a_root_without_layout() -> None:
    document = with_index_root_layout(build_template_document(PROMPT, None), None)

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    assert "корень экрана `index` без `layout`" in str(error.value)


def test_check_edited_document_rejects_a_root_that_is_not_a_view() -> None:
    document = with_index_root_type(build_template_document(PROMPT, None), "ScrollView")

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    assert "корень экрана `index` — `ScrollView`, нужен `View`" in str(error.value)


async def test_generate_document_still_rejects_a_single_screen_document() -> None:
    client = FakeLlmClient([dump(build_template_document("blank", None)), valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=2)

    assert len(document.screens) >= 2
    assert len(client.calls) == 2
    assert "экранов в документе 1, нужно от 2 до 5" in client.calls[1][-1]["content"]


async def test_generate_document_retries_a_root_that_does_not_fill_the_scene() -> None:
    short_root = dump(
        with_index_root_layout(build_template_document(PROMPT, None), AppNodeLayout(x=0, y=0, width=370, height=560))
    )
    client = FakeLlmClient([short_root, valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=2)

    root = next(screen.root for screen in document.screens if screen.route == "index")
    assert root.layout == AppNodeLayout(x=0, y=0, width=370, height=640)
    assert len(client.calls) == 2
    assert client.calls[1][-2] == {"role": "assistant", "content": short_root}
    assert "`layout` корня экрана `index` — 0, 0, 370, 560" in client.calls[1][-1]["content"]


async def test_generate_document_retries_a_document_without_screens() -> None:
    no_screens = dump(build_template_document(PROMPT, None).model_copy(update={"screens": []}))
    client = FakeLlmClient([no_screens, valid_answer()])

    document = await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=2)

    assert len(document.screens) == 2
    assert len(client.calls) == 2
    assert "экранов в документе 0" in client.calls[1][-1]["content"]


async def test_generate_document_fails_when_the_root_never_fills_the_scene() -> None:
    answers: list[str | Exception] = [
        dump(
            with_index_root_layout(
                build_template_document(PROMPT, None), AppNodeLayout(x=0, y=0, width=370, height=height)
            )
        )
        for height in (560, 600)
    ]
    client = FakeLlmClient(answers)

    with pytest.raises(GenerationError) as error:
        await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=2)

    assert len(client.calls) == 2
    assert "0, 0, 370, 600" in error.value.message


async def test_generate_document_with_a_brief_sends_the_rules_only_prompt() -> None:
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=1, brief="бриф")

    assert client.calls[0][0]["content"] == build_system_prompt(has_brief=True)


async def test_generate_document_without_a_brief_sends_the_full_design_prompt() -> None:
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=MODEL, max_attempts=1)

    assert client.calls[0][0]["content"] == build_system_prompt(has_brief=False)


def with_added_screen_route(document: AppDocument, route: str) -> AppDocument:
    extra = document.screens[-1].model_copy(update={"id": "screen-progress", "route": route})
    return document.model_copy(update={"screens": [*document.screens, extra]})


def test_check_document_rejects_a_route_with_a_leading_slash() -> None:
    document = with_added_screen_route(build_template_document(PROMPT, None), "/progress")

    with pytest.raises(ValueError) as error:
        check_document(document)

    message = str(error.value)
    assert "не может иметь ведущий `/`" in message
    assert "`screen-progress` (`route` `/progress`)" in message


def test_check_document_accepts_index_and_slashless_routes() -> None:
    check_document(with_added_screen_route(build_template_document(PROMPT, None), "progress"))


def test_check_edited_document_rejects_a_route_with_a_leading_slash() -> None:
    document = with_added_screen_route(build_template_document(PROMPT, None), "/progress")

    with pytest.raises(ValueError) as error:
        check_edited_document(document)

    assert "`screen-progress` (`route` `/progress`)" in str(error.value)


def test_check_edited_document_accepts_index_and_slashless_routes() -> None:
    check_edited_document(with_added_screen_route(build_template_document(PROMPT, None), "progress"))


NON_STRICT_MODELS = [
    "anthropic/claude-sonnet-5",
    "anthropic/claude-opus-5",
    "anthropic/claude-fable-5",
    "x-ai/grok-4.6",
]
STRICT_MODELS = [
    "deepseek/deepseek-v4-flash",
    "deepseek/deepseek-v4-pro",
    "openai/gpt-5.6-terra",
    "openai/gpt-5.6-sol",
]


@pytest.mark.parametrize("model", NON_STRICT_MODELS)
@pytest.mark.parametrize("brief", [None, "бриф"])
async def test_non_strict_models_get_the_plain_schema_in_the_prompt(model: str, brief: str | None) -> None:
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=model, max_attempts=1, brief=brief)

    assert client.calls[0][0]["content"] == build_system_prompt(has_brief=brief is not None, strict_schema=False)
    assert client.schemas[0] == AppDocument.model_json_schema(by_alias=True)


@pytest.mark.parametrize("model", STRICT_MODELS)
@pytest.mark.parametrize("brief", [None, "бриф"])
async def test_other_models_keep_the_strict_schema_in_the_prompt(model: str, brief: str | None) -> None:
    client = FakeLlmClient([valid_answer()])

    await generate_document(PROMPT, None, client=client, model=model, max_attempts=1, brief=brief)

    assert client.calls[0][0]["content"] == build_system_prompt(has_brief=brief is not None)
    assert client.schemas[0] == app_document_schema()


async def test_document_with_optional_fields_omitted_validates_like_one_with_explicit_nulls() -> None:
    omitted = json.loads(valid_answer())
    with_nulls = json.loads(valid_answer())
    root = with_nulls["screens"][0]["root"]
    root["layout"]["zIndex"] = None
    root["props"] = {"text": None, "href": None}
    root.pop("style", None)
    root["style"] = {"backgroundColor": None, "shadow": None}
    assert "zIndex" not in omitted["screens"][0]["root"]["layout"]

    client = FakeLlmClient([json.dumps(omitted)])
    from_omitted = await generate_document(PROMPT, None, client=client, model=NON_STRICT_MODELS[0], max_attempts=1)
    from_nulls = AppDocument.model_validate(with_nulls)

    assert from_omitted.screens[0].root.layout is not None
    assert from_omitted.screens[0].root.layout.z_index is None
    assert from_nulls.screens[0].root.layout is not None
    assert from_nulls.screens[0].root.layout.z_index is None
    assert from_nulls.screens[0].root.props is not None
    assert from_nulls.screens[0].root.props.text is None
    assert (
        from_omitted.model_dump(by_alias=True)["screens"][0]["root"]["layout"]
        == (from_nulls.model_dump(by_alias=True)["screens"][0]["root"]["layout"])
    )
