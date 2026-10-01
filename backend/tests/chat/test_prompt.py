from src.chat.prompt import build_system_prompt
from src.generation.prompt import DESIGN_RULES, EXPORT_RULES
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
    assert "`navigation.roots` не бывает пустым" in prompt


def test_chat_prompt_does_not_impose_the_generation_screen_count() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert "от 2 до 5 экранов" not in prompt
