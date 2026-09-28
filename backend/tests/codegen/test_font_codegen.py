import json
import typing

import pytest
from pydantic import ValidationError

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
from src.codegen.service import GOOGLE_FONTS, SYSTEM_FONT, generate_files
from src.generation.prompt import EXPORT_RULES, app_document_schema
from tests.codegen.max_coverage_document import THEME

FontWeight = typing.Literal["400", "500", "600", "700"]


def _document(
    *children: AppNode,
    font_body: AppFontFamily = "Inter",
    font_heading: AppFontFamily = "Lora",
    navigation: AppNavType = "stack",
) -> AppDocument:
    return AppDocument(
        id="doc-fonts",
        name="Fonts",
        theme=THEME.model_copy(update={"font_body": font_body, "font_heading": font_heading}),
        navigation=AppNavigation(type=navigation, roots=["screen-index"]),
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
        created_at="2026-09-28T10:00:00+00:00",
        updated_at="2026-09-28T10:00:00+00:00",
    )


def _text(font_size: float | None = None, font_weight: FontWeight | None = None) -> AppNode:
    return AppNode(
        id="text",
        type="Text",
        layout=AppNodeLayout(x=16, y=24, width=300, height=40),
        props=AppNodeProps(text="Заголовок"),
        style=AppNodeStyle(font_size=font_size, font_weight=font_weight),
    )


def _screen(document: AppDocument) -> str:
    return generate_files(document)["app/index.tsx"]


@pytest.mark.parametrize(
    ("font_weight", "expected"),
    [
        (None, "Inter_400Regular"),
        ("400", "Inter_400Regular"),
        ("500", "Inter_400Regular"),
        ("600", "Inter_700Bold"),
        ("700", "Inter_700Bold"),
    ],
)
def test_text_weight_maps_onto_the_closer_loaded_file(font_weight: FontWeight | None, expected: str) -> None:
    screen = _screen(_document(_text(font_size=16, font_weight=font_weight)))

    assert f"  fontFamily: '{expected}',\n  fontWeight: 'normal'\n}}}}>" in screen
    assert screen.count("fontWeight") == 1


@pytest.mark.parametrize(
    ("font_size", "expected"),
    [
        (None, "Inter_700Bold"),
        (14, "Inter_700Bold"),
        (19.5, "Inter_700Bold"),
        (20, "Lora_700Bold"),
        (32, "Lora_700Bold"),
    ],
)
def test_text_uses_heading_font_from_font_size_20(font_size: float | None, expected: str) -> None:
    screen = _screen(_document(_text(font_size=font_size, font_weight="700")))

    assert f"fontFamily: '{expected}'" in screen


def test_large_regular_text_is_still_a_heading() -> None:
    screen = _screen(_document(_text(font_size=40, font_weight="400")))

    assert "fontFamily: 'Lora_400Regular'" in screen


def test_bound_text_gets_the_font_too() -> None:
    node = _text(font_size=24)
    node.props = AppNodeProps(text_bind="title")
    document = _document(node)
    document.state = {"title": "Привет"}

    assert "fontFamily: 'Lora_400Regular'" in _screen(document)


def test_button_label_uses_body_font_and_defaults_to_bold() -> None:
    button = AppNode(
        id="cta",
        type="Button",
        layout=AppNodeLayout(x=16, y=500, width=338, height=48),
        props=AppNodeProps(text="Сохранить"),
        style=AppNodeStyle(font_size=24),
    )
    screen = _screen(_document(button))
    label_style = screen[screen.index("labelStyle={") : screen.index("onPress=")]

    assert "fontFamily: 'Inter_700Bold'" in label_style
    assert "fontWeight: 'normal'" in label_style
    assert "'600'" not in label_style
    assert "Lora" not in screen


def test_button_regular_weight_uses_regular_file() -> None:
    button = AppNode(id="cta", type="Button", props=AppNodeProps(text="Ок"), style=AppNodeStyle(font_weight="500"))

    assert "fontFamily: 'Inter_400Regular'" in _screen(_document(button))


def test_text_input_font_goes_to_content_style_and_drops_font_weight() -> None:
    field = AppNode(
        id="email",
        type="TextInput",
        layout=AppNodeLayout(x=16, y=100, width=338, height=48),
        props=AppNodeProps(placeholder="Почта"),
        style=AppNodeStyle(font_weight="700", font_size=22),
    )
    screen = _screen(_document(field))
    style = screen[screen.index("style={") : screen.index("contentStyle={")]
    content_style = screen[screen.index("contentStyle={") : screen.index("outlineStyle={")]

    assert "fontWeight" not in style
    assert "fontFamily" not in style
    assert "fontFamily: 'Inter_700Bold'" in content_style
    assert "fontWeight: 'normal'" in content_style


def test_system_font_keeps_the_previous_output() -> None:
    nodes = (
        _text(font_size=24, font_weight="700"),
        AppNode(id="cta", type="Button", props=AppNodeProps(text="Ок")),
        AppNode(id="field", type="TextInput", style=AppNodeStyle(font_weight="500")),
    )
    files = generate_files(_document(*nodes, font_body="System", font_heading="System"))

    assert "fontFamily" not in files["app/index.tsx"]
    assert "fontWeight: '700'" in files["app/index.tsx"]
    assert "fontWeight: '600'" in files["app/index.tsx"]
    assert "fontWeight: '500'" in files["app/index.tsx"]
    assert "useFonts" not in files["app/_layout.tsx"]
    assert not any(name.startswith("@expo-google-fonts/") for name in json.loads(files["package.json"])["dependencies"])


def test_system_heading_with_google_body_leaves_headings_untouched() -> None:
    screen = _screen(_document(_text(font_size=28, font_weight="700"), font_heading="System"))

    assert "fontFamily" not in screen
    assert "fontWeight: '700'" in screen


def test_package_json_adds_only_the_theme_font_packages_last() -> None:
    dependencies = json.loads(
        generate_files(_document(font_body="PT Serif", font_heading="JetBrains Mono"))["package.json"]
    )["dependencies"]

    assert list(dependencies.items())[-2:] == [
        ("@expo-google-fonts/pt-serif", "~0.4.1"),
        ("@expo-google-fonts/jetbrains-mono", "~0.4.1"),
    ]
    assert dependencies["expo-font"] == "~13.0.4"
    assert sum(name.startswith("@expo-google-fonts/") for name in dependencies) == 2


def test_same_body_and_heading_font_is_added_once() -> None:
    files = generate_files(_document(font_body="Nunito", font_heading="Nunito"))
    dependencies = json.loads(files["package.json"])["dependencies"]

    assert [name for name in dependencies if name.startswith("@expo-google-fonts/")] == ["@expo-google-fonts/nunito"]
    assert files["app/_layout.tsx"].count("Nunito_400Regular") == 2


def test_font_packages_come_after_icon_packages() -> None:
    icon = AppNode(id="icon", type="Icon", props=AppNodeProps(icon="bell"))
    dependencies = json.loads(generate_files(_document(icon))["package.json"])["dependencies"]

    assert list(dependencies)[-4:] == [
        "lucide-react-native",
        "react-native-svg",
        "@expo-google-fonts/inter",
        "@expo-google-fonts/lora",
    ]


@pytest.mark.parametrize("navigation", ["stack", "tabs"])
def test_layout_loads_both_weights_per_family_before_rendering(navigation: AppNavType) -> None:
    layout = generate_files(_document(navigation=navigation))["app/_layout.tsx"]

    assert (
        "import { paperTheme, theme } from '../theme';\n"
        "import { useFonts } from 'expo-font';\n"
        "import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';\n"
        "import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';\n"
        "import { Lora_400Regular } from '@expo-google-fonts/lora/400Regular';\n"
        "import { Lora_700Bold } from '@expo-google-fonts/lora/700Bold';\n"
        "\n"
        "export default function Layout() {\n"
        "  const [fontsLoaded, fontError] = useFonts({\n"
        "    Inter_400Regular,\n"
        "    Inter_700Bold,\n"
        "    Lora_400Regular,\n"
        "    Lora_700Bold,\n"
        "  });\n"
        "  if (!fontsLoaded && !fontError) return null;\n"
        "  return (\n"
    ) in layout


def test_every_curated_family_has_a_package() -> None:
    assert set(GOOGLE_FONTS) == set(typing.get_args(AppFontFamily)) - {SYSTEM_FONT}


def test_unknown_font_family_is_rejected() -> None:
    theme = THEME.model_dump(by_alias=True)
    for value in ("Roboto", "system", "Inter Bold", "Syne"):
        with pytest.raises(ValidationError):
            AppThemeTokens.model_validate({**theme, "fontBody": value})


def test_strict_schema_exposes_curated_font_enum() -> None:
    theme = app_document_schema()["$defs"]["AppThemeTokens"]["properties"]
    families = list(typing.get_args(AppFontFamily))

    assert theme["fontBody"]["enum"] == families
    assert theme["fontHeading"]["enum"] == families


def test_prompt_lists_every_curated_family() -> None:
    for family in typing.get_args(AppFontFamily):
        assert f"`{family}`" in EXPORT_RULES
