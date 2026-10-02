from typing import Literal

import pytest

from src.apps.schemas import AppDocument, AppNavigation, AppNode, AppScreen
from src.codegen.service import generate_files
from tests.codegen.max_coverage_document import THEME

SCREENS = (
    ("scr-today", "Сегодня", "index"),
    ("scr-stats", "Статистика", "stats"),
    ("scr-settings", "Настройки", "settings"),
)


def _document(navigation: Literal["tabs", "stack"], roots: list[str]) -> AppDocument:
    return AppDocument(
        id="doc-roots",
        name="Roots",
        theme=THEME,
        navigation=AppNavigation(type=navigation, roots=roots),
        screens=[
            AppScreen(id=screen_id, name=name, route=route, root=AppNode(id=f"root-{route}", type="View"))
            for screen_id, name, route in SCREENS
        ],
        state={},
        revision=1,
        created_at="2026-10-02T10:00:00+00:00",
        updated_at="2026-10-02T10:00:00+00:00",
    )


def _navigator_screens(layout: str) -> list[str]:
    return [line.strip() for line in layout.splitlines() if ".Screen name=" in line]


def test_tabs_resolve_roots_by_screen_id_and_name_the_tab_by_route() -> None:
    layout = generate_files(_document("tabs", ["scr-today", "scr-stats", "scr-settings"]))["app/_layout.tsx"]

    assert _navigator_screens(layout) == [
        "<Tabs.Screen name=\"index\" options={{ title: 'Сегодня' }} />",
        "<Tabs.Screen name=\"stats\" options={{ title: 'Статистика' }} />",
        "<Tabs.Screen name=\"settings\" options={{ title: 'Настройки' }} />",
    ]


def test_tabs_follow_the_order_of_roots_not_of_screens() -> None:
    layout = generate_files(_document("tabs", ["scr-settings", "scr-today"]))["app/_layout.tsx"]

    assert _navigator_screens(layout) == [
        "<Tabs.Screen name=\"settings\" options={{ title: 'Настройки' }} />",
        "<Tabs.Screen name=\"index\" options={{ title: 'Сегодня' }} />",
    ]


def test_tabs_do_not_treat_a_route_in_roots_as_a_screen_reference() -> None:
    layout = generate_files(_document("tabs", ["index", "scr-stats", "settings"]))["app/_layout.tsx"]

    assert _navigator_screens(layout) == ["<Tabs.Screen name=\"stats\" options={{ title: 'Статистика' }} />"]


def test_stack_lists_every_screen_whatever_roots_say() -> None:
    layout = generate_files(_document("stack", ["scr-stats"]))["app/_layout.tsx"]

    assert _navigator_screens(layout) == [
        "<Stack.Screen name=\"index\" options={{ title: 'Сегодня' }} />",
        "<Stack.Screen name=\"stats\" options={{ title: 'Статистика' }} />",
        "<Stack.Screen name=\"settings\" options={{ title: 'Настройки' }} />",
    ]


@pytest.mark.parametrize("navigation", ["tabs", "stack"])
def test_screen_files_are_named_by_route_not_by_id(navigation: Literal["tabs", "stack"]) -> None:
    files = generate_files(_document(navigation, ["scr-today", "scr-stats", "scr-settings"]))

    assert {path for path in files if path.startswith("app/")} == {
        "app/_layout.tsx",
        "app/index.tsx",
        "app/stats.tsx",
        "app/settings.tsx",
    }
