from src.generation.prompt import (
    DESIGN_RULES,
    DESIGN_SELF_CHECK,
    DESIGN_VARIETY,
    EXPORT_RULES,
    RULES,
    START_ROUTE,
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
