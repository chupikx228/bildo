import json
from typing import Any

import pytest

from src.apps.colors import invalid_colors
from src.apps.schemas import AppDocument
from tests.generation.template_fixtures import build_template_document


def with_colors(document: AppDocument, screen: int, node_id: str, **style: str) -> AppDocument:
    dumped: dict[str, Any] = json.loads(document.model_dump_json(by_alias=True))

    def patch(node: dict[str, Any]) -> None:
        if node["id"] == node_id:
            node["style"] = {**node.get("style", {}), **style}
        for child in node.get("children", []):
            patch(child)

    patch(dumped["screens"][screen]["root"])
    return AppDocument.model_validate(dumped)


def with_theme(document: AppDocument, **tokens: str) -> AppDocument:
    return document.model_copy(update={"theme": document.theme.model_copy(update=tokens)})


def places(document: AppDocument, baseline: AppDocument | None = None) -> list[str]:
    return [f"{color.place} = {color.value}" for color in invalid_colors(document, baseline)]


@pytest.fixture
def document() -> AppDocument:
    return build_template_document("трекер привычек", None)


def test_the_template_documents_have_no_invalid_colors(document: AppDocument) -> None:
    assert invalid_colors(document) == []


@pytest.mark.parametrize(
    "value",
    [
        "#fff",
        "#FFF",
        "#ffff",
        "#E8F1EE",
        "#e8f1ee",
        "#E8F1EE80",
        "transparent",
        "rgb(10, 20, 30)",
        "rgba(0,0,0,0.5)",
        "hsl(120, 40%, 50%)",
        "hsla(120, 40%, 50%, 0.3)",
    ],
)
def test_node_colors_accept_hex_transparent_and_functional_notation(document: AppDocument, value: str) -> None:
    patched = with_colors(document, 0, "habits-title", color=value, backgroundColor=value, borderColor=value)

    assert invalid_colors(patched) == []


@pytest.mark.parametrize(
    "value",
    [
        "colorText",
        "colorPrimary",
        "",
        " ",
        "#",
        "#12",
        "#12345",
        "#1234567",
        "#GGGGGG",
        "E8F1EE",
        " #FFF",
        "#FFF\n",
        "red",
    ],
)
def test_node_colors_reject_token_names_and_malformed_values(document: AppDocument, value: str) -> None:
    patched = with_colors(document, 0, "habits-title", color=value)

    assert places(patched) == [f"экран `index`, узел `habits-title`, `style.color` = {value}"]


@pytest.mark.parametrize("field", ["color", "backgroundColor", "borderColor"])
def test_every_node_color_field_is_checked(document: AppDocument, field: str) -> None:
    patched = with_colors(document, 0, "habits-title", **{field: "colorText"})

    assert places(patched) == [f"экран `index`, узел `habits-title`, `style.{field}` = colorText"]


def test_nested_nodes_on_every_screen_are_checked(document: AppDocument) -> None:
    nested = next(node for node in document.screens[0].root.children if node.children)
    child = nested.children[0]
    patched = with_colors(document, 0, child.id, color="colorText")
    other = with_colors(patched, 1, document.screens[1].root.children[0].id, backgroundColor="colorBg")

    found = places(other)

    assert f"экран `index`, узел `{child.id}`, `style.color` = colorText" in found
    assert any(entry.startswith("экран `progress`") and entry.endswith("colorBg") for entry in found)
    assert len(found) == 2


def test_theme_tokens_accept_three_and_six_digit_hex_only(document: AppDocument) -> None:
    assert invalid_colors(with_theme(document, color_bg="#abc", color_text="#101014")) == []

    found = places(with_theme(document, color_bg="#ABCD", color_text="transparent", color_primary="rgb(1,2,3)"))

    assert found == ["theme.colorBg = #ABCD", "theme.colorText = transparent", "theme.colorPrimary = rgb(1,2,3)"]


def test_theme_token_name_in_the_theme_is_reported_with_its_json_name(document: AppDocument) -> None:
    assert places(with_theme(document, color_surface="colorSurface")) == ["theme.colorSurface = colorSurface"]


def test_unchanged_invalid_colors_are_ignored_against_the_baseline(document: AppDocument) -> None:
    old = with_colors(document, 1, document.screens[1].root.children[0].id, color="colorText")
    old = with_theme(old, color_border="colorBorder")
    edited = with_colors(old, 0, "habits-title", color="colorPrimary")

    assert places(edited, old) == ["экран `index`, узел `habits-title`, `style.color` = colorPrimary"]
    assert len(invalid_colors(edited)) == 3


def test_a_changed_invalid_color_is_reported_even_when_the_baseline_had_another_invalid_value(
    document: AppDocument,
) -> None:
    old = with_colors(document, 0, "habits-title", color="colorText")
    edited = with_colors(old, 0, "habits-title", color="colorMuted")

    assert places(edited, old) == ["экран `index`, узел `habits-title`, `style.color` = colorMuted"]


def test_a_node_new_to_the_document_is_checked_even_with_a_baseline(document: AppDocument) -> None:
    edited = with_colors(document, 0, "habits-title", color="colorText")

    assert places(edited, document) == ["экран `index`, узел `habits-title`, `style.color` = colorText"]
