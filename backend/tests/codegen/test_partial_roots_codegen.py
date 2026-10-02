from src.apps.schemas import (
    AppDocument,
    AppNavigation,
    AppNode,
    AppNodeLayout,
    AppNodeProps,
    AppScreen,
    NavigateAction,
)
from src.codegen.service import generate_files
from tests.codegen.max_coverage_document import THEME


def _screen(screen_id: str, name: str, route: str, children: list[AppNode] | None = None) -> AppScreen:
    return AppScreen(
        id=screen_id,
        name=name,
        route=route,
        root=AppNode(id=f"root-{route}", type="View", children=children or []),
    )


def _document(navigation_type: str = "tabs") -> AppDocument:
    open_settings = AppNode(
        id="open-settings",
        type="Button",
        layout=AppNodeLayout(x=16, y=24, width=200, height=44),
        props=AppNodeProps(text="Настройки", on_press=[NavigateAction(type="navigate", route="settings")]),
    )
    return AppDocument(
        id="doc-partial",
        name="Partial",
        theme=THEME,
        navigation=AppNavigation(type=navigation_type, roots=["screen-index", "screen-stats"]),
        screens=[
            _screen("screen-index", "Сегодня", "index", [open_settings]),
            _screen("screen-stats", "Статистика", "stats"),
            _screen("screen-settings", "Настройки", "settings"),
        ],
        revision=1,
        created_at="2026-10-01T10:00:00+00:00",
        updated_at="2026-10-01T10:00:00+00:00",
    )


def test_screen_outside_roots_gets_href_null() -> None:
    files = generate_files(_document())
    layout = files["app/_layout.tsx"]

    assert layout.count("<Tabs.Screen ") == 3
    assert "<Tabs.Screen name=\"settings\" options={{ href: null, title: 'Настройки' }} />" in layout
    assert layout.count("href: null") == 1
    assert "<Tabs.Screen name=\"index\" options={{ title: 'Сегодня' }} />" in layout
    assert "<Tabs.Screen name=\"stats\" options={{ title: 'Статистика' }} />" in layout
    assert "app/settings.tsx" in files


def test_full_roots_have_no_href_null() -> None:
    document = _document()
    document.navigation.roots = ["screen-index", "screen-stats", "screen-settings"]

    assert "href: null" not in generate_files(document)["app/_layout.tsx"]


def test_stack_layout_is_unaffected() -> None:
    assert "href: null" not in generate_files(_document("stack"))["app/_layout.tsx"]
