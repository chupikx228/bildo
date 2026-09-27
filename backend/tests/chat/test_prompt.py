from src.chat.prompt import build_system_prompt
from src.generation.prompt import DESIGN_RULES, EXPORT_RULES
from tests.generation.template_fixtures import build_template_document


def test_chat_prompt_keeps_the_export_facts_that_moved_out_of_design_rules() -> None:
    prompt = build_system_prompt(build_template_document("трекер привычек", None))

    assert DESIGN_RULES in prompt
    assert EXPORT_RULES in prompt
