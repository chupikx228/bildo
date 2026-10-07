import re
from dataclasses import dataclass

from src.apps.schemas import AppDocument, AppNode

THEME_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
NODE_COLOR = re.compile(
    r"^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|transparent|(?:rgb|hsl)a?\([^()]*\))$"
)

ColorKey = tuple[str, str, str]


@dataclass(frozen=True)
class DocumentColor:
    key: ColorKey
    place: str
    value: str
    valid: bool


def invalid_colors(document: AppDocument, baseline: AppDocument | None = None) -> list[DocumentColor]:
    unchanged = {color.key: color.value for color in _colors(baseline)} if baseline is not None else {}
    return [color for color in _colors(document) if not color.valid and unchanged.get(color.key) != color.value]


def _colors(document: AppDocument) -> list[DocumentColor]:
    colors = _theme_colors(document)
    for screen in document.screens:
        for node in _walk(screen.root):
            colors.extend(_node_colors(screen.id, node))
    return colors


def _theme_colors(document: AppDocument) -> list[DocumentColor]:
    colors: list[DocumentColor] = []
    for name, field in type(document.theme).model_fields.items():
        if not name.startswith("color_"):
            continue
        alias = field.alias or name
        value = getattr(document.theme, name)
        colors.append(
            DocumentColor(("", "theme", alias), f"theme.{alias}", value, THEME_COLOR.fullmatch(value) is not None)
        )
    return colors


def _node_colors(screen_id: str, node: AppNode) -> list[DocumentColor]:
    if node.style is None:
        return []
    values = {
        "color": node.style.color,
        "backgroundColor": node.style.background_color,
        "borderColor": node.style.border_color,
    }
    return [
        DocumentColor(
            (screen_id, node.id, field),
            f"экран `{screen_id}`, узел `{node.id}`, `style.{field}`",
            value,
            NODE_COLOR.fullmatch(value) is not None,
        )
        for field, value in values.items()
        if value is not None
    ]


def _walk(node: AppNode) -> list[AppNode]:
    nodes = [node]
    for child in node.children:
        nodes.extend(_walk(child))
    return nodes
