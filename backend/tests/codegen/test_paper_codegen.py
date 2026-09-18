import json
import math
import re
from typing import Literal

import pytest

from src.apps.schemas import (
    AppDocument,
    AppNavigation,
    AppNode,
    AppNodeLayout,
    AppNodeProps,
    AppNodeStyle,
    AppScreen,
)
from src.codegen.service import generate_files
from tests.codegen.max_coverage_document import THEME, build_max_coverage_document


def _document(*children: AppNode, navigation_type: Literal["tabs", "stack", "drawer"] = "stack") -> AppDocument:
    return AppDocument(
        id="doc-paper",
        name="Paper",
        theme=THEME,
        navigation=AppNavigation(type=navigation_type, roots=["screen-index"]),
        screens=[
            AppScreen(
                id="screen-index",
                name="Главная",
                route="index",
                root=AppNode(id="root", type="View", children=list(children)),
            )
        ],
        state={},
        revision=1,
        created_at="2026-09-18T10:00:00+00:00",
        updated_at="2026-09-18T10:00:00+00:00",
    )


def _screen(*children: AppNode) -> str:
    return generate_files(_document(*children))["app/index.tsx"]


def _button(style: AppNodeStyle | None = None, height: float = 48) -> AppNode:
    return AppNode(
        id="button",
        type="Button",
        layout=AppNodeLayout(x=16, y=24, width=200, height=height),
        props=AppNodeProps(text="Купить"),
        style=style,
    )


def _input(style: AppNodeStyle | None = None, value_bind: str | None = None) -> AppNode:
    return AppNode(
        id="input",
        type="TextInput",
        layout=AppNodeLayout(x=16, y=100, width=300, height=44),
        props=AppNodeProps(placeholder="Имя", value_bind=value_bind),
        style=style,
    )


def _jsx_attribute(source: str, tag: str, name: str) -> str:
    element = source[source.index("<" + tag + "\n") :]
    start = element.index("\n" + " " * 8 + name + "=") + 1
    rest = element[start:]
    end = re.search(r"\n {6}(?: {2})?\S", rest)
    assert end is not None
    return rest[: end.start()].strip()


def test_package_json_pins_paper_5_15() -> None:
    package = json.loads(generate_files(_document())["package.json"])

    assert package["dependencies"]["react-native-paper"] == "~5.15.3"
    assert "react-native-safe-area-context" in package["dependencies"]
    assert package["dependencies"]["@expo/vector-icons"] == "~14.0.4"
    assert package["dependencies"]["expo-font"] == "~13.0.4"


@pytest.mark.parametrize("navigation_type", ["tabs", "stack", "drawer"])
def test_layout_wraps_navigator_in_paper_provider(navigation_type: Literal["tabs", "stack", "drawer"]) -> None:
    layout = generate_files(_document(navigation_type=navigation_type))["app/_layout.tsx"]

    assert "import { PaperProvider } from 'react-native-paper';" in layout
    assert "import { paperTheme, theme } from '../theme';" in layout
    safe_area = layout.index("<SafeAreaProvider>")
    provider = layout.index("<PaperProvider theme={paperTheme}>")
    state = layout.index("<AppStateProvider>")
    assert safe_area < provider < state
    assert layout.index("</AppStateProvider>") < layout.index("</PaperProvider>") < layout.index("</SafeAreaProvider>")


def test_theme_file_builds_md3_theme_from_tokens() -> None:
    theme_file = generate_files(_document())["theme.ts"]

    assert "import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';" in theme_file
    assert '"colorPrimary": "#5C6CF5"' in theme_file
    assert "export const paperTheme: MD3Theme = {" in theme_file
    assert "const base = dark ? MD3DarkTheme : MD3LightTheme;" in theme_file
    assert "mode: 'exact'," in theme_file
    assert "roundness: Number.isFinite(radius) && radius >= 0 ? radius : 12," in theme_file
    for slot in ("secondary", "tertiary"):
        assert f"    {slot}: theme.colorPrimary," in theme_file
        assert f"    on{slot.capitalize()}: theme.colorPrimaryFg," in theme_file
    assert "    primaryContainer: mix(theme.colorBg, theme.colorPrimary, 0.16)," in theme_file
    assert "    secondaryContainer: mix(theme.colorSurface, theme.colorPrimary, 0.16)," in theme_file
    assert "    onSurfaceVariant: theme.colorTextMuted," in theme_file
    assert "    outline: theme.colorBorder," in theme_file
    for level, share in enumerate(("0.05", "0.08", "0.11", "0.12", "0.14"), start=1):
        assert f"      level{level}: mix(theme.colorSurface, theme.colorPrimary, {share})," in theme_file
    for base_slot in ("error:", "onError:", "errorContainer:", "onErrorContainer:", "backdrop:"):
        assert f"    {base_slot}" not in theme_file


def test_theme_file_template_does_not_depend_on_tokens() -> None:
    first = generate_files(_document())["theme.ts"]
    other = _document().model_copy(update={"theme": THEME.model_copy(update={"color_bg": "#FFFFFF"})})
    second = generate_files(other)["theme.ts"]

    assert first.split(" as const;\n", 1)[1] == second.split(" as const;\n", 1)[1]


def test_button_is_a_compact_contained_paper_button() -> None:
    screen = _screen(_button())

    assert "import { Button } from 'react-native-paper';" in screen
    assert "import { paperTheme, theme } from '../theme';" in screen
    assert "Pressable" not in screen
    assert 'mode="contained"' in screen
    assert "        compact\n" in screen
    assert _jsx_attribute(screen, "Button", "buttonColor") == "buttonColor={theme.colorPrimary}"
    assert _jsx_attribute(screen, "Button", "textColor") == "textColor={theme.colorPrimaryFg}"
    assert "borderRadius: paperTheme.roundness" in _jsx_attribute(screen, "Button", "style")
    assert "Купить" in screen


def test_button_drops_flex_padding_and_gradient_from_style() -> None:
    style = AppNodeStyle(
        flex=1,
        flex_direction="row",
        align_items="center",
        justify_content="center",
        gap=8,
        padding=6,
        padding_vertical=12,
        background_gradient="linear-gradient(#000,#fff)",
        margin_top=4,
        opacity=0.5,
    )
    button_style = _jsx_attribute(_screen(_button(style)), "Button", "style")

    for dropped in ("flex", "alignItems", "justifyContent", "gap", "padding", "backgroundGradient"):
        assert dropped not in button_style
    assert "marginTop: 4" in button_style
    assert "opacity: 0.5" in button_style


def test_button_height_goes_through_content_style_minus_border() -> None:
    screen = _screen(_button(AppNodeStyle(border_width=2), height=48))

    assert "height: 48" in _jsx_attribute(screen, "Button", "style")
    assert _jsx_attribute(screen, "Button", "contentStyle") == "contentStyle={{\n  height: 44\n}}"


def test_button_border_width_without_color_falls_back_to_theme_border() -> None:
    button_style = _jsx_attribute(_screen(_button(AppNodeStyle(border_width=1))), "Button", "style")

    assert "borderWidth: 1,\n  borderColor: theme.colorBorder" in button_style


def test_button_shadow_switches_to_elevated_and_is_not_emitted() -> None:
    screen = _screen(_button(AppNodeStyle(shadow="0 6px 16px rgba(0,0,0,.3)")))

    assert 'mode="elevated"' in screen
    assert "shadow" not in screen


def test_button_colors_are_mapped_to_props() -> None:
    screen = _screen(_button(AppNodeStyle(background_color="#112233", color="#FFEEDD")))

    assert _jsx_attribute(screen, "Button", "buttonColor") == "buttonColor={'#112233'}"
    assert _jsx_attribute(screen, "Button", "textColor") == "textColor={'#FFEEDD'}"
    assert "backgroundColor" not in _jsx_attribute(screen, "Button", "style")


def test_button_typography_and_padding_go_to_label_style() -> None:
    style = AppNodeStyle(padding_horizontal=20, font_size=16, font_weight="700", letter_spacing=0.5, line_height=24)
    label = _jsx_attribute(_screen(_button(style)), "Button", "labelStyle")

    assert label == (
        "labelStyle={{\n  marginHorizontal: 20,\n  marginVertical: 0,\n  fontSize: 16,\n"
        "  fontWeight: '700',\n  letterSpacing: 0.5,\n  lineHeight: 24\n}}"
    )


def test_button_label_margin_falls_back_to_padding_then_default() -> None:
    with_padding = _jsx_attribute(_screen(_button(AppNodeStyle(padding=6))), "Button", "labelStyle")
    default = _jsx_attribute(_screen(_button()), "Button", "labelStyle")

    assert "marginHorizontal: 6" in with_padding
    assert "marginHorizontal: 16" in default
    assert "fontWeight: '600'" in default
    assert "lineHeight" not in default


@pytest.mark.parametrize(("font_size", "line_height"), [(7.5, 11), (15, 21), (13, 18), (17.5, 25), (22.5, 31)])
def test_button_line_height_rounds_half_up_like_js(font_size: float, line_height: int) -> None:
    label = _jsx_attribute(_screen(_button(AppNodeStyle(font_size=font_size))), "Button", "labelStyle")

    assert f"lineHeight: {line_height}\n" in label


def test_button_line_height_half_case_differs_from_python_round() -> None:
    assert 7.5 * 1.4 == 10.5
    assert round(7.5 * 1.4) == 10
    assert math.floor(7.5 * 1.4 + 0.5) == 11


@pytest.mark.parametrize(
    ("text_align", "justify"), [("left", "flex-start"), ("center", "center"), ("right", "flex-end")]
)
def test_button_text_align_maps_to_content_justify(
    text_align: Literal["left", "center", "right"], justify: str
) -> None:
    content = _jsx_attribute(_screen(_button(AppNodeStyle(text_align=text_align))), "Button", "contentStyle")

    assert f"justifyContent: '{justify}'" in content
    assert "textAlign" not in _screen(_button(AppNodeStyle(text_align=text_align)))


def test_text_input_is_outlined_without_label_or_hardcoded_placeholder_color() -> None:
    screen = _screen(_input())

    assert "import { TextInput } from 'react-native-paper';" in screen
    assert "from 'react-native';" in screen
    assert "TextInput" not in screen.split("\n", 1)[0]
    assert 'mode="outlined"' in screen
    assert 'placeholder="Имя"' in screen
    assert "label=" not in screen
    assert "placeholderTextColor" not in screen
    assert "#71717A" not in screen


def test_text_input_defaults() -> None:
    screen = _screen(_input())

    input_style = _jsx_attribute(screen, "TextInput", "style")
    assert "fontSize: 14" in input_style
    assert "backgroundColor: theme.colorSurface" in input_style
    assert _jsx_attribute(screen, "TextInput", "contentStyle") == "contentStyle={{\n  paddingHorizontal: 10\n}}"
    assert _jsx_attribute(screen, "TextInput", "outlineStyle") == (
        "outlineStyle={{\n  borderRadius: paperTheme.roundness\n}}"
    )
    assert "outlineColor" not in screen
    assert "textColor" not in screen


def test_text_input_moves_color_spacing_and_border_out_of_style() -> None:
    style = AppNodeStyle(
        color="#FAFAFA",
        letter_spacing=1,
        border_radius=8,
        border_width=2,
        border_color="#FF0000",
        background_color="#101010",
        padding_horizontal=12,
        padding_vertical=8,
        font_size=16,
        font_weight="500",
        shadow="0 1px 2px #000",
        background_gradient="linear-gradient(#000,#fff)",
        align_items="center",
    )
    screen = _screen(_input(style))

    input_style = _jsx_attribute(screen, "TextInput", "style")
    for dropped in ("color:", "letterSpacing", "border", "padding", "shadow", "Gradient", "alignItems"):
        assert dropped not in input_style
    assert "fontSize: 16" in input_style
    assert "fontWeight: '500'" in input_style
    assert "backgroundColor: '#101010'" in input_style
    assert _jsx_attribute(screen, "TextInput", "contentStyle") == (
        "contentStyle={{\n  paddingHorizontal: 12,\n  letterSpacing: 1\n}}"
    )
    assert _jsx_attribute(screen, "TextInput", "outlineStyle") == (
        "outlineStyle={{\n  borderRadius: 8,\n  borderWidth: 2\n}}"
    )
    assert _jsx_attribute(screen, "TextInput", "outlineColor") == "outlineColor={'#FF0000'}"
    assert _jsx_attribute(screen, "TextInput", "textColor") == "textColor={'#FAFAFA'}"


def test_text_input_zero_border_hides_outline_at_rest() -> None:
    screen = _screen(_input(AppNodeStyle(border_width=0, border_color="#FF0000")))

    assert 'outlineColor="transparent"' in screen
    assert "borderWidth" not in _jsx_attribute(screen, "TextInput", "outlineStyle")


def test_text_input_value_bind_keeps_state_wiring() -> None:
    screen = _screen(_input(value_bind="userName"))

    assert "value={String(state['userName'] ?? '')}" in screen
    assert "onChangeText={(t) => setVar('userName', t)}" in screen


def test_screen_without_paper_nodes_imports_nothing_from_paper() -> None:
    text = AppNode(id="t", type="Text", props=AppNodeProps(text="Привет"))
    screen = _screen(text)

    assert "react-native-paper" not in screen
    assert "import { theme } from '../theme';" in screen


def test_other_node_types_keep_inert_style_fields() -> None:
    screen = generate_files(build_max_coverage_document())["app/index.tsx"]

    assert "animation: 'rise'" in screen
    assert "animation: 'shimmer'" in screen
