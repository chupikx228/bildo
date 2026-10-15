import copy
from typing import Any

import pytest
from pydantic import ValidationError

from src.apps.icons import ICON_NAMES, LEGACY_ICON_NAMES, MAX_CLOSEST_ICONS, closest_icon_names, normalize_icons
from src.apps.schemas import AppDocument, AppNodeProps
from tests.apps.icon_fixtures import document_json, icon_of, with_icons, with_nested_icon


def test_every_alias_points_at_an_icon_in_the_current_enum() -> None:
    assert [target for target in LEGACY_ICON_NAMES.values() if target not in ICON_NAMES] == []


def test_no_alias_shadows_a_name_of_the_enum() -> None:
    assert sorted(set(LEGACY_ICON_NAMES) & set(ICON_NAMES)) == []


@pytest.mark.parametrize(("old", "current"), sorted(LEGACY_ICON_NAMES.items()))
def test_every_legacy_name_is_replaced_by_its_current_name(old: str, current: str) -> None:
    document = with_icons(document_json(), ("icon-1", old))

    normalized, invalid = normalize_icons(document)

    assert icon_of(normalized, "icon-1") == current
    assert invalid == []
    assert AppDocument.model_validate(normalized).screens != []


def test_check_circle_is_the_reported_legacy_name_and_maps_to_circle_check() -> None:
    assert LEGACY_ICON_NAMES["check-circle"] == "circle-check"


def test_valid_icons_stay_as_they_are() -> None:
    document = with_icons(document_json(), *[(f"icon-{name}", name) for name in ICON_NAMES])

    normalized, invalid = normalize_icons(document)

    assert normalized == document
    assert invalid == []


def test_normalization_does_not_mutate_the_input() -> None:
    document = with_icons(document_json(), ("icon-1", "home"), ("icon-2", "rocket"))
    before = copy.deepcopy(document)

    normalize_icons(document)

    assert document == before


def test_nested_nodes_are_normalized() -> None:
    document = with_nested_icon(document_json(), "deep", "alert-circle")

    normalized, _ = normalize_icons(document)

    assert icon_of(normalized, "deep") == "circle-alert"


def test_icons_on_every_screen_are_normalized() -> None:
    document = with_icons(document_json(), ("first", "home"), screen=0)
    document = with_icons(document, ("second", "trash-2"), screen=1)

    normalized, _ = normalize_icons(document)

    assert icon_of(normalized, "first") == "house"
    assert icon_of(normalized, "second") == "trash"


def test_an_unknown_name_is_reported_with_its_place_and_blanked() -> None:
    document = with_icons(document_json(), ("icon-1", "rocket"))
    screen_id = document["screens"][0]["id"]

    normalized, invalid = normalize_icons(document)

    assert [(icon.screen_id, icon.node_id, icon.value) for icon in invalid] == [(screen_id, "icon-1", "rocket")]
    assert icon_of(normalized, "icon-1") is None


def test_a_valid_lucide_icon_missing_from_the_enum_is_not_mapped() -> None:
    document = with_icons(document_json(), ("icon-1", "circle"), ("icon-2", "edit"))

    _, invalid = normalize_icons(document)

    assert [icon.value for icon in invalid] == ["circle", "edit"]


@pytest.mark.parametrize("value", ["Home", " house", "HOUSE", "circle_check", "CircleCheck", ""])
def test_spelling_variants_of_valid_names_are_not_guessed(value: str) -> None:
    document = with_icons(document_json(), ("icon-1", value))

    _, invalid = normalize_icons(document)

    assert [icon.value for icon in invalid] == [value]


@pytest.mark.parametrize("value", [None, 5, True, ["home"], {"name": "home"}])
def test_values_that_are_not_strings_are_left_for_the_schema(value: object) -> None:
    document = with_icons(document_json(), ("icon-1", value))

    normalized, invalid = normalize_icons(document)

    assert icon_of(normalized, "icon-1") == value
    assert invalid == []


def test_chat_response_with_a_nested_document_is_normalized() -> None:
    response: dict[str, Any] = {
        "reply": "готово",
        "document": with_icons(document_json(), ("icon-1", "home")),
    }

    normalized, _ = normalize_icons(response)

    assert icon_of(normalized["document"], "icon-1") == "house"


def test_the_schema_itself_stays_strict_for_legacy_names() -> None:
    with pytest.raises(ValidationError):
        AppNodeProps.model_validate({"icon": "check-circle"})
    with pytest.raises(ValidationError):
        AppDocument.model_validate(with_icons(document_json(), ("icon-1", "home")))


def test_closest_names_share_a_part_of_the_name() -> None:
    assert closest_icon_names("circle") == ["circle-alert", "circle-check", "circle-x"]
    assert closest_icon_names("bar-chart") == ["chart-bar", "chart-pie"]


def test_closest_names_are_capped() -> None:
    assert len(closest_icon_names("circle")) == MAX_CLOSEST_ICONS


def test_closest_names_catch_a_typo_but_not_noise() -> None:
    assert closest_icon_names("dollar") == ["dollar-sign"]
    assert closest_icon_names("rocket") == []
    assert closest_icon_names("") == []
