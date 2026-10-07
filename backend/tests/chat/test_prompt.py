import hashlib
import json
from typing import Any

from src.chat.prompt import (
    ALL_KEYS_RULE,
    OMIT_OPTIONAL_KEYS_RULE,
    RULES,
    build_messages,
    build_system_prompt,
    response_schema,
)
from src.chat.schemas import ChatTurnResponse
from src.generation.json_schema import to_strict_json_schema
from src.generation.prompt import DESIGN_RULES, EXPORT_RULES, OMIT_OPTIONAL_RULE
from src.generation.structured_output import VALIDATION_FEEDBACK_HEADER
from tests.generation.template_fixtures import build_template_document


def test_chat_prompt_keeps_the_export_facts_that_moved_out_of_design_rules() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert DESIGN_RULES in prompt
    assert EXPORT_RULES in prompt


def test_chat_prompt_states_the_root_geometry_rule() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert "Корневой узел каждого экрана — `View`" in prompt
    assert "`layout` ровно 0, 0, 370, 640: он занимает всю сцену" in prompt


def test_chat_prompt_states_the_start_route_rule() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert "стартовый экран — тот, чей `route` буквально `index`" in prompt


def test_chat_prompt_defines_roots_as_screen_ids() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert "`navigation.roots` — список `id` корневых экранов" in prompt
    assert "Он не бывает пустым и ссылается только на `id` существующих экранов" in prompt
    assert "меняй `id`\n  существующих экранов: на них ссылается `navigation.roots`" in prompt
    assert "`navigation.roots` и действия `navigate` ссылаются только на существующие" not in prompt
    assert "Действия `navigate` ссылаются только на существующие `route` экранов" in prompt


def test_chat_prompt_does_not_impose_the_generation_screen_count() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert "от 2 до 5 экранов" not in prompt


def test_chat_prompt_keeps_validation_feedback_out_of_the_reply() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert f"«{VALIDATION_FEEDBACK_HEADER} …»" in prompt
    assert "пользователь её не видит" in prompt
    assert "упоминай в `reply` проверку, валидацию, ошибки, исправления, повторные попытки" in prompt


STRICT_RULES_SHA256 = "add478ab7b2742ebc2a51ffd35b5e626216f4a066b0eb5fce19d28bfd272788a"
STRICT_SCHEMA_SHA256 = "47cc618c3a023ea45191b36d50efc5891f1d2a45c31594967b988893039cb34f"
DOCUMENT_MARKER = "\n\nТекущий документ приложения:\n"  # noqa: RUF001
SCHEMA_MARKER = "(схема `AppDocument` — внутри неё):\n"


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def rules_section(prompt: str) -> str:
    return prompt.split(DOCUMENT_MARKER, 1)[0]


def schema_section(prompt: str) -> dict[str, Any]:
    decoded: dict[str, Any] = json.loads(prompt.split(SCHEMA_MARKER, 1)[1])
    return decoded


def test_default_chat_prompt_is_byte_for_byte_what_it_was_before_the_family_switch() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert sha256(rules_section(prompt)) == STRICT_RULES_SHA256
    assert sha256(prompt.split(SCHEMA_MARKER, 1)[1]) == STRICT_SCHEMA_SHA256
    assert sha256(json.dumps(response_schema(), ensure_ascii=False)) == STRICT_SCHEMA_SHA256


def test_default_chat_prompt_keeps_the_strict_schema_and_the_all_keys_rule() -> None:
    document = build_template_document("трекер привычек", None)
    prompt = build_system_prompt(document)

    assert ALL_KEYS_RULE in RULES
    assert ALL_KEYS_RULE in prompt
    assert OMIT_OPTIONAL_KEYS_RULE not in prompt
    assert schema_section(prompt) == to_strict_json_schema(ChatTurnResponse.model_json_schema(by_alias=True))
    assert prompt == build_system_prompt(document, strict_schema=True)


def test_non_strict_chat_prompt_carries_the_plain_schema_and_lets_optional_fields_be_omitted() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None), strict_schema=False)
    schema = schema_section(prompt)

    assert schema == ChatTurnResponse.model_json_schema(by_alias=True)
    assert OMIT_OPTIONAL_RULE.removesuffix(";") in prompt
    assert OMIT_OPTIONAL_KEYS_RULE in prompt
    assert ALL_KEYS_RULE not in prompt
    assert "не опускай ключ" not in prompt
    layout = schema["$defs"]["AppNodeLayout"]
    assert "zIndex" in layout["properties"]
    assert "zIndex" not in layout["required"]
    assert "additionalProperties" not in layout


def test_non_strict_chat_prompt_differs_from_the_strict_one_only_in_the_format_rule_and_the_schema() -> None:
    document = build_template_document("трекер привычек", None)
    strict = build_system_prompt(document)
    plain = build_system_prompt(document, strict_schema=False)

    assert rules_section(plain) == rules_section(strict).replace(ALL_KEYS_RULE, OMIT_OPTIONAL_KEYS_RULE)
    strict_document = strict.split(DOCUMENT_MARKER, 1)[1].split(SCHEMA_MARKER, 1)[0]
    plain_document = plain.split(DOCUMENT_MARKER, 1)[1].split(SCHEMA_MARKER, 1)[0]
    assert plain_document == strict_document


def test_non_strict_chat_prompt_still_asks_for_document_and_edited_explicitly() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None), strict_schema=False)

    assert "верни `document: null`" in prompt
    assert "`document` и `edited` указывай в каждом ответе" in prompt


def test_chat_schema_strictness_is_selectable() -> None:
    assert response_schema() == response_schema(strict=True)
    assert response_schema(strict=False) == ChatTurnResponse.model_json_schema(by_alias=True)


def test_plain_chat_schema_makes_the_optional_response_fields_omittable_and_the_strict_one_requires_them() -> None:
    plain = response_schema(strict=False)
    strict = response_schema()

    assert plain["required"] == ["reply"]
    assert set(strict["required"]) == {"reply", "document", "edited"}
    assert "AppDocument" in plain["$defs"]
    assert "AppDocument" in strict["$defs"]


def test_chat_messages_carry_the_family_choice_into_the_system_prompt() -> None:
    document = build_template_document("трекер привычек", None)

    default = build_messages(document, [])
    plain = build_messages(document, [], strict_schema=False)

    assert default[0]["content"] == build_system_prompt(document)
    assert plain[0]["content"] == build_system_prompt(document, strict_schema=False)
