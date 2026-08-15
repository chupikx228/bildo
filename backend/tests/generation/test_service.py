import pytest

from src.apps.schemas import AppDocument, AppNode, NavigateAction
from src.generation.service import BUILDERS, TemplateKey, generate_document, select_template

TEMPLATE_PROMPTS: dict[TemplateKey, str] = {
    "habits": "трекер привычек и серии дней",
    "social": "социальная сеть и лента постов",
    "shop": "магазин мебели и корзина",
    "forms": "форма заявки на консультацию",
    "blank": "приложение про космос",
}


def collect_nodes(node: AppNode) -> list[AppNode]:
    nodes = [node]
    for child in node.children:
        nodes.extend(collect_nodes(child))
    return nodes


def collect_navigate_actions(root: AppNode) -> list[NavigateAction]:
    actions = []
    for node in collect_nodes(root):
        if node.props is None:
            continue
        for action in (node.props.on_press or []) + (node.props.on_change or []):
            if isinstance(action, NavigateAction):
                actions.append(action)
    return actions


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        ("трекер привычек на каждый день", "habits"),
        ("habit tracker with a streak", "habits"),
        ("медитация по утрам", "habits"),
        ("соцсеть для музыкантов", "social"),
        ("app with a feed and friends", "social"),
        ("чат для команды", "social"),
        ("интернет-магазин и корзина", "shop"),
        ("online store with a cart", "shop"),
        ("доставка еды", "shop"),
        ("форма обратной связи", "forms"),
        ("a signup form", "forms"),
        ("опрос сотрудников", "forms"),
    ],
)
def test_select_template_by_keyword(prompt: str, expected: TemplateKey) -> None:
    assert select_template(prompt) == expected


def test_select_template_ignores_case() -> None:
    assert select_template("ПРИВЫЧКИ КАЖДЫЙ ДЕНЬ") == "habits"
    assert select_template("Online STORE") == "shop"


def test_select_template_defaults_to_blank() -> None:
    assert select_template("приложение про космос") == "blank"
    assert select_template("something entirely different") == "blank"


def test_first_matching_keyword_wins() -> None:
    assert select_template("трекер привычек и магазин") == "habits"


def test_different_keywords_produce_different_documents() -> None:
    names = {generate_document(prompt, None).name for prompt in TEMPLATE_PROMPTS.values()}

    assert len(names) == len(TEMPLATE_PROMPTS)


@pytest.mark.parametrize(("key", "prompt"), list(TEMPLATE_PROMPTS.items()))
def test_generate_document_matches_selected_template(key: TemplateKey, prompt: str) -> None:
    document = generate_document(prompt, None)

    assert document.name == BUILDERS[key]().name


@pytest.mark.parametrize("prompt", list(TEMPLATE_PROMPTS.values()))
def test_generate_document_is_valid_app_document(prompt: str) -> None:
    document = generate_document(prompt, None)

    payload = document.model_dump(mode="json", by_alias=True)

    assert AppDocument.model_validate(payload) == document


@pytest.mark.parametrize("prompt", list(TEMPLATE_PROMPTS.values()))
def test_generate_document_keeps_prompt_and_timestamps(prompt: str) -> None:
    document = generate_document(prompt, None)

    assert document.prompt == prompt
    assert document.created_at == document.updated_at
    assert document.created_at != ""


@pytest.mark.parametrize("prompt", list(TEMPLATE_PROMPTS.values()))
def test_generate_document_has_screens_reachable_from_navigation(prompt: str) -> None:
    document = generate_document(prompt, None)

    screen_ids = {screen.id for screen in document.screens}

    assert document.screens != []
    assert set(document.navigation.roots) <= screen_ids


@pytest.mark.parametrize("prompt", list(TEMPLATE_PROMPTS.values()))
def test_generate_document_routes_are_bare_identifiers(prompt: str) -> None:
    document = generate_document(prompt, None)

    assert all(not screen.route.startswith("/") for screen in document.screens)


@pytest.mark.parametrize("prompt", list(TEMPLATE_PROMPTS.values()))
def test_generate_document_navigate_actions_point_at_existing_screens(prompt: str) -> None:
    document = generate_document(prompt, None)

    routes = {screen.route for screen in document.screens}
    targets = [action.route for screen in document.screens for action in collect_navigate_actions(screen.root)]

    assert set(targets) <= routes
    assert targets != [] or len(document.screens) == 1


@pytest.mark.parametrize("prompt", list(TEMPLATE_PROMPTS.values()))
def test_generate_document_node_ids_are_unique(prompt: str) -> None:
    document = generate_document(prompt, None)

    node_ids = [node.id for screen in document.screens for node in collect_nodes(screen.root)]

    assert len(node_ids) == len(set(node_ids))


def test_generate_document_uses_given_name() -> None:
    document = generate_document("трекер привычек", "Мои привычки")

    assert document.name == "Мои привычки"


def test_generate_document_gives_unique_ids() -> None:
    first = generate_document("трекер привычек", None)
    second = generate_document("трекер привычек", None)

    assert first.id != second.id
