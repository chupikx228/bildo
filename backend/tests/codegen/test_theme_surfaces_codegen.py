import re

import pytest

from src.apps.schemas import (
    AppDocument,
    AppFontFamily,
    AppNavigation,
    AppNavType,
    AppNode,
    AppNodeLayout,
    AppNodeProps,
    AppNodeStyle,
    AppScreen,
    AppThemeTokens,
)
from src.codegen.service import generate_files
from tests.codegen.max_coverage_document import THEME

LIGHT_THEME = THEME.model_copy(
    update={
        "color_bg": "#FFF8F0",
        "color_surface": "#F3E6D8",
        "color_border": "#E0CDB8",
        "color_text": "#2B1D12",
        "color_text_muted": "#7A6552",
        "color_primary": "#C2410C",
        "color_primary_fg": "#FFFFFF",
    }
)


def _flat_list(style: AppNodeStyle | None = None) -> AppNode:
    return AppNode(
        id="list",
        type="FlatList",
        layout=AppNodeLayout(x=16, y=80, width=338, height=200),
        props=AppNodeProps(data=["Первый", "Второй"]),
        style=style,
    )


def _image_placeholder() -> AppNode:
    return AppNode(
        id="image",
        type="Image",
        layout=AppNodeLayout(x=16, y=300, width=160, height=120),
        style=AppNodeStyle(border_radius=16),
    )


def _document(
    *children: AppNode,
    font_body: AppFontFamily = "Inter",
    font_heading: AppFontFamily = "Lora",
    navigation: AppNavType = "stack",
    theme: AppThemeTokens = LIGHT_THEME,
) -> AppDocument:
    return AppDocument(
        id="doc-surfaces",
        name="Surfaces",
        theme=theme.model_copy(update={"font_body": font_body, "font_heading": font_heading}),
        navigation=AppNavigation(type=navigation, roots=["screen-index", "screen-list"]),
        screens=[
            AppScreen(
                id="screen-index",
                name="Главная",
                route="index",
                root=AppNode(id="root", type="View", children=list(children)),
            ),
            AppScreen(
                id="screen-list",
                name="Список",
                route="list",
                root=AppNode(id="root-list", type="View", children=[]),
            ),
        ],
        state={},
        revision=1,
        created_at="2026-10-01T10:00:00+00:00",
        updated_at="2026-10-01T10:00:00+00:00",
    )


def _container(screen: str) -> str:
    match = re.search(r"<FlatList\n\s*style=\{(.*?)\}\n\s*data=", screen, re.DOTALL)
    assert match is not None
    return match.group(1)


def _row(screen: str) -> str:
    match = re.search(r"renderItem=\{\(\{ item \}\) => \(\n(.*?)\n\s*\)\}", screen, re.DOTALL)
    assert match is not None
    return match.group(1)


def _layout(document: AppDocument) -> str:
    return generate_files(document)["app/_layout.tsx"]


def test_flat_list_row_uses_body_font_regular() -> None:
    row = _row(generate_files(_document(_flat_list()))["app/index.tsx"])

    assert "<Text style={{ color: theme.colorText, fontFamily: 'Inter_400Regular', fontWeight: 'normal' }}>" in row
    assert "Lora" not in row
    assert "Bold" not in row


def test_flat_list_row_keeps_system_font_untouched() -> None:
    row = _row(generate_files(_document(_flat_list(), font_body="System"))["app/index.tsx"])

    assert "<Text style={{ color: theme.colorText }}>{String(item)}</Text>" in row
    assert "fontFamily" not in row


def test_flat_list_row_uses_theme_color_tokens() -> None:
    screen = generate_files(_document(_flat_list()))["app/index.tsx"]
    row = _row(screen)

    assert "backgroundColor: theme.colorSurface" in row
    assert "color: theme.colorText" in row
    assert re.search(r"#[0-9A-Fa-f]{3,8}", row) is None


def test_flat_list_row_radius_follows_radius_base() -> None:
    screen = generate_files(_document(_flat_list()))["app/index.tsx"]
    row = _row(screen)

    assert (
        "<View style={{ padding: 12, backgroundColor: theme.colorSurface,"
        " borderRadius: paperTheme.roundness, marginBottom: 8 }}>" in row
    )
    assert "borderRadius: 10" not in row
    assert "import { paperTheme, theme } from '../theme';\n" in screen
    assert "react-native-paper" not in screen


def test_screen_without_flat_list_or_paper_nodes_imports_theme_only() -> None:
    screen = generate_files(_document(_image_placeholder()))["app/index.tsx"]

    assert "import { theme } from '../theme';\n" in screen


def test_flat_list_node_text_style_applies_to_rows_over_theme_font_default() -> None:
    style = AppNodeStyle(color="#FF0000", background_color="#00FF00", font_size=28, font_weight="700")
    screen = generate_files(_document(_flat_list(style)))["app/index.tsx"]

    assert (
        "<Text style={{ color: '#FF0000', fontSize: 28, fontFamily: 'Lora_700Bold', fontWeight: 'normal' }}>"
        in _row(screen)
    )


def test_flat_list_node_font_weight_alone_keeps_body_font() -> None:
    screen = generate_files(_document(_flat_list(AppNodeStyle(font_weight="600"))))["app/index.tsx"]

    assert "<Text style={{ color: theme.colorText, fontFamily: 'Inter_700Bold', fontWeight: 'normal' }}>" in _row(
        screen
    )


def test_flat_list_node_text_style_with_system_font_keeps_font_weight() -> None:
    style = AppNodeStyle(color="#FF0000", font_size=18, font_weight="700")
    screen = generate_files(_document(_flat_list(style), font_body="System", font_heading="System"))["app/index.tsx"]

    assert "<Text style={{ color: '#FF0000', fontSize: 18, fontWeight: '700' }}>" in _row(screen)


def test_flat_list_node_text_style_leaves_the_container() -> None:
    style = AppNodeStyle(color="#FF0000", background_color="#00FF00", font_size=28, font_weight="700", gap=8)
    container = _container(generate_files(_document(_flat_list(style)))["app/index.tsx"])

    assert "backgroundColor: '#00FF00'" in container
    assert "gap: 8" in container
    assert "color" not in container.replace("backgroundColor", "")
    assert "fontSize" not in container
    assert "fontWeight" not in container


def test_image_placeholder_uses_theme_color_tokens() -> None:
    screen = generate_files(_document(_image_placeholder()))["app/index.tsx"]

    assert "{ backgroundColor: theme.colorSurface, alignItems: 'center', justifyContent: 'center' }" in screen
    assert "<Text style={{ color: theme.colorTextMuted }}>Image</Text>" in screen
    assert "#27272A" not in screen
    assert "#71717A" not in screen


def test_image_with_source_is_unchanged() -> None:
    node = _image_placeholder().model_copy(update={"props": AppNodeProps(source="https://example.com/a.png")})
    screen = generate_files(_document(node))["app/index.tsx"]

    assert "<Image source={{ uri: 'https://example.com/a.png' }}" in screen
    assert "colorTextMuted" not in screen


@pytest.mark.parametrize("navigation", ["stack", "tabs", "drawer"])
def test_header_title_uses_heading_font_bold(navigation: AppNavType) -> None:
    layout = _layout(_document(navigation=navigation))

    assert "                headerTitleStyle: { fontFamily: 'Lora_700Bold', fontWeight: 'normal' },\n" in layout
    assert "Inter_700Bold', fontWeight" not in layout


def test_header_title_keeps_system_heading_untouched() -> None:
    layout = _layout(_document(font_heading="System"))

    assert "headerTitleStyle" not in layout


@pytest.mark.parametrize("navigation", ["stack", "drawer"])
def test_header_back_title_uses_body_font_regular(navigation: AppNavType) -> None:
    layout = _layout(_document(navigation=navigation))

    assert "                headerBackTitleStyle: { fontFamily: 'Inter_400Regular' },\n" in layout


def test_header_back_title_keeps_system_body_untouched() -> None:
    layout = _layout(_document(font_body="System"))

    assert "headerBackTitleStyle" not in layout
    assert "headerTitleStyle: { fontFamily: 'Lora_700Bold'" in layout


def test_tabs_layout_has_no_header_back_title_style() -> None:
    assert "headerBackTitleStyle" not in _layout(_document(navigation="tabs"))


def test_tab_labels_use_body_font_regular() -> None:
    layout = _layout(_document(navigation="tabs"))

    assert "                tabBarLabelStyle: { fontFamily: 'Inter_400Regular', fontWeight: 'normal' },\n" in layout


def test_tab_labels_keep_system_body_untouched() -> None:
    layout = _layout(_document(navigation="tabs", font_body="System"))

    assert "tabBarLabelStyle" not in layout
    assert "headerTitleStyle: { fontFamily: 'Lora_700Bold'" in layout


def test_stack_layout_has_no_tab_label_style() -> None:
    assert "tabBarLabelStyle" not in _layout(_document(navigation="stack"))


@pytest.mark.parametrize("navigation", ["stack", "tabs"])
def test_navigator_fonts_are_loaded_by_the_font_gate(navigation: AppNavType) -> None:
    layout = _layout(_document(navigation=navigation, font_body="PT Serif", font_heading="Unbounded"))
    loaded = set(re.findall(r"^    (\w+),$", layout, re.MULTILINE))
    used = set(re.findall(r"fontFamily: '(\w+)'", layout))

    assert used
    assert used <= loaded


@pytest.mark.parametrize("navigation", ["stack", "tabs"])
def test_system_fonts_leave_navigator_options_unchanged(navigation: AppNavType) -> None:
    layout = _layout(_document(navigation=navigation, font_body="System", font_heading="System"))

    assert "fontFamily" not in layout
    assert "useFonts" not in layout
