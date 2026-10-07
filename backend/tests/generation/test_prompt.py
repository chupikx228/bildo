import json

import pytest

from src.apps.schemas import AppDocument
from src.generation.json_schema import to_strict_json_schema
from src.generation.prompt import (
    ALL_KEYS_RULE,
    DESIGN_RULES,
    DESIGN_SELF_CHECK,
    DESIGN_VARIETY,
    EXPORT_RULES,
    OMIT_OPTIONAL_RULE,
    RULES,
    START_ROUTE,
    app_document_schema,
    build_messages,
    build_system_prompt,
)

EXPORT_FACTS = (
    "`colorPrimaryFg` — текст на залитых акцентом кнопках",
    "экспорт уже применяет `radiusBase` к ним по умолчанию",
    "`shadow` в экспорте работает только как переключатель на `Button`",
)


def test_prompt_with_a_brief_is_rules_and_schema_only() -> None:
    prompt = build_system_prompt(has_brief=True)

    assert prompt.startswith(RULES)
    assert "JSON Schema документа:" in prompt
    for block in (DESIGN_RULES, DESIGN_SELF_CHECK, DESIGN_VARIETY):
        assert block not in prompt


def test_prompt_without_a_brief_keeps_the_full_design_stack_in_order() -> None:
    prompt = build_system_prompt(has_brief=False)

    positions = [prompt.index(block) for block in (DESIGN_RULES, DESIGN_SELF_CHECK, DESIGN_VARIETY, RULES)]
    assert positions == sorted(positions)
    assert prompt.index("JSON Schema документа:") > positions[-1]


def test_export_facts_live_in_rules_once_and_reach_both_prompts() -> None:
    assert EXPORT_RULES in RULES
    for fact in EXPORT_FACTS:
        assert fact not in DESIGN_RULES
        assert build_system_prompt(has_brief=True).count(fact) == 1
        assert build_system_prompt(has_brief=False).count(fact) == 1


def test_rules_say_the_start_route_is_literally_index_whatever_the_brief_calls_it() -> None:
    assert f"буквально строка `{START_ROUTE}`" in RULES
    assert "никогда не переводи и не переименовывай" in RULES


def test_build_messages_passes_the_flag_through_to_the_system_prompt() -> None:
    assert build_messages("бриф", None, has_brief=True)[0]["content"] == build_system_prompt(has_brief=True)
    assert build_messages("идея", None, has_brief=False)[0]["content"] == build_system_prompt(has_brief=False)


def test_rules_define_roots_as_screen_ids_not_routes() -> None:
    assert "`navigation.roots` — список `id` корневых экранов" in RULES
    assert "не их `route`: каждый элемент — `id` существующего экрана" in RULES
    assert "`navigation.roots` содержит только существующие `route`" not in RULES


def test_rules_no_longer_require_the_start_screen_id_to_be_index() -> None:
    assert f"`route` стартового экрана всегда `{START_ROUTE}`" in RULES
    assert "имеет `id` и `route`" not in RULES


def schema_section(prompt: str) -> dict[str, object]:
    decoded: dict[str, object] = json.loads(prompt.split("JSON Schema документа:\n", 1)[1])
    return decoded


def test_default_prompt_keeps_the_strict_schema_and_the_all_keys_rule() -> None:
    prompt = build_system_prompt(has_brief=True)

    assert ALL_KEYS_RULE in RULES
    assert ALL_KEYS_RULE in prompt
    assert OMIT_OPTIONAL_RULE not in prompt
    assert schema_section(prompt) == to_strict_json_schema(AppDocument.model_json_schema(by_alias=True))
    assert build_system_prompt(has_brief=True) == build_system_prompt(has_brief=True, strict_schema=True)


@pytest.mark.parametrize("has_brief", [True, False])
def test_non_strict_prompt_carries_the_plain_schema_and_lets_optional_fields_be_omitted(has_brief: bool) -> None:
    prompt = build_system_prompt(has_brief=has_brief, strict_schema=False)
    schema = schema_section(prompt)

    assert schema == AppDocument.model_json_schema(by_alias=True)
    assert OMIT_OPTIONAL_RULE in prompt
    assert ALL_KEYS_RULE not in prompt
    assert "ставь `null`" not in prompt
    layout = schema["$defs"]["AppNodeLayout"]  # type: ignore[index]
    assert "zIndex" in layout["properties"]
    assert "zIndex" not in layout["required"]
    assert "additionalProperties" not in layout


def test_non_strict_prompt_differs_from_the_strict_one_only_in_the_format_rule_and_the_schema() -> None:
    strict = build_system_prompt(has_brief=False)
    plain = build_system_prompt(has_brief=False, strict_schema=False)

    strict_head = strict.split("JSON Schema документа:\n", 1)[0]
    plain_head = plain.split("JSON Schema документа:\n", 1)[0]
    assert plain_head == strict_head.replace(ALL_KEYS_RULE, OMIT_OPTIONAL_RULE)


def test_app_document_schema_strictness_is_selectable() -> None:
    assert app_document_schema() == app_document_schema(strict=True)
    assert app_document_schema(strict=False) == AppDocument.model_json_schema(by_alias=True)
    assert app_document_schema(strict=False) != app_document_schema(strict=True)
