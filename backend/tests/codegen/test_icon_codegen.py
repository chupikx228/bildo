import json
import typing

import pytest
from pydantic import ValidationError

from src.apps.schemas import (
    AppDocument,
    AppIconName,
    AppNavigation,
    AppNode,
    AppNodeLayout,
    AppNodeProps,
    AppNodeStyle,
    AppScreen,
)
from src.codegen.service import generate_files
from src.generation.prompt import app_document_schema
from tests.codegen.max_coverage_document import THEME


def _document(*children: AppNode) -> AppDocument:
    return AppDocument(
        id="doc-icons",
        name="Icons",
        theme=THEME,
        navigation=AppNavigation(type="stack", roots=["screen-index"]),
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


def _icon(
    icon: AppIconName | None,
    *,
    node_id: str = "icon",
    layout: AppNodeLayout | None = None,
    style: AppNodeStyle | None = None,
) -> AppNode:
    return AppNode(
        id=node_id,
        type="Icon",
        layout=layout if layout is not None else AppNodeLayout(x=16, y=24, width=40, height=28),
        props=AppNodeProps(icon=icon),
        style=style,
    )


def test_icon_renders_lucide_component_in_positioned_container() -> None:
    screen = generate_files(_document(_icon("arrow-left", style=AppNodeStyle(color="#FF0000"))))["app/index.tsx"]

    assert (
        "      <View style={{\n"
        "  position: 'absolute',\n"
        "  left: 16,\n"
        "  top: 24,\n"
        "  width: 40,\n"
        "  height: 28,\n"
        "  alignItems: 'center',\n"
        "  justifyContent: 'center'\n"
        "}}>\n"
        "        <ArrowLeftIcon\n"
        "          size={28}\n"
        "          color={'#FF0000'}\n"
        "        />\n"
        "      </View>"
    ) in screen


def test_icon_color_falls_back_to_theme_text() -> None:
    screen = generate_files(_document(_icon("heart")))["app/index.tsx"]

    assert "color={theme.colorText}" in screen


def test_icon_drops_style_fields_other_than_color_and_opacity() -> None:
    style = AppNodeStyle(
        color="#101014",
        opacity=0.5,
        background_color="#00FF00",
        border_radius=12,
        border_width=2,
        padding=8,
        font_size=20,
        shadow="0 2px 4px rgba(0,0,0,.2)",
        animation="pulse",
    )
    screen = generate_files(_document(_icon("star", style=style)))["app/index.tsx"]
    icon_container = screen[screen.index("left: 16") : screen.index("</View>")]

    assert "opacity: 0.5" in icon_container
    for dropped in ("backgroundColor", "borderRadius", "borderWidth", "padding", "fontSize", "shadow", "animation"):
        assert dropped not in icon_container


def test_icon_imports_only_used_components_sorted() -> None:
    document = _document(
        _icon("shopping-cart", node_id="a"),
        _icon("house", node_id="b"),
        _icon("house", node_id="c"),
        _icon("share-2", node_id="d"),
    )
    screen = generate_files(document)["app/index.tsx"]

    assert "import { HouseIcon, Share2Icon, ShoppingCartIcon } from 'lucide-react-native';\n" in screen
    assert screen.count("lucide-react-native") == 1


def test_image_icon_does_not_clash_with_react_native_image() -> None:
    image = AppNode(id="photo", type="Image", layout=AppNodeLayout(x=0, y=0, width=100, height=100))
    screen = generate_files(_document(image, _icon("image")))["app/index.tsx"]

    assert "import { Image, Text, View } from 'react-native';" in screen
    assert "import { ImageIcon } from 'lucide-react-native';" in screen


def test_icon_without_name_renders_empty_container_and_no_import() -> None:
    files = generate_files(_document(_icon(None)))

    assert "lucide-react-native" not in files["app/index.tsx"]
    assert "alignItems: 'center'" in files["app/index.tsx"]
    assert "lucide-react-native" not in json.loads(files["package.json"])["dependencies"]


def test_package_json_adds_lucide_and_svg_only_when_icons_are_used() -> None:
    without = json.loads(generate_files(_document())["package.json"])["dependencies"]
    with_icons = json.loads(generate_files(_document(_icon("bell")))["package.json"])["dependencies"]

    assert "lucide-react-native" not in without
    assert "react-native-svg" not in without
    assert with_icons["lucide-react-native"] == "~1.48.0"
    assert with_icons["react-native-svg"] == "15.8.0"
    assert list(with_icons)[-2:] == ["lucide-react-native", "react-native-svg"]


def test_hidden_icon_renders_null_but_keeps_dependency() -> None:
    node = _icon("bell")
    node.hidden = True
    files = generate_files(_document(node))

    assert "{null}" in files["app/index.tsx"]
    assert "BellIcon" not in files["app/index.tsx"].split("export default")[1]
    assert "lucide-react-native" in json.loads(files["package.json"])["dependencies"]


def test_unknown_icon_name_is_rejected() -> None:
    with pytest.raises(ValidationError):
        AppNodeProps.model_validate({"icon": "home"})


def test_strict_schema_exposes_curated_icon_enum() -> None:
    props = app_document_schema()["$defs"]["AppNodeProps"]["properties"]["icon"]
    enums = [branch["enum"] for branch in props["anyOf"] if "enum" in branch]

    assert enums == [list(typing.get_args(AppIconName))]
