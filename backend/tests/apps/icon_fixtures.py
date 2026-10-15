import json
from typing import Any

from src.apps.schemas import AppDocument
from tests.generation.template_fixtures import build_template_document

PROMPT = "трекер привычек и серии дней"


def document_json(document: AppDocument | None = None) -> dict[str, Any]:
    source = document or build_template_document(PROMPT, "Трекер привычек")
    dumped: dict[str, Any] = json.loads(source.model_dump_json(by_alias=True))
    return dumped


def icon_node(node_id: str, icon: object) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "Icon",
        "props": {"icon": icon},
        "layout": {"x": 16, "y": 16, "width": 24, "height": 24},
    }


def with_icons(document: dict[str, Any], *icons: tuple[str, object], screen: int = 0) -> dict[str, Any]:
    root = document["screens"][screen]["root"]
    root["children"] = [*root.get("children", []), *(icon_node(node_id, icon) for node_id, icon in icons)]
    return document


def with_nested_icon(document: dict[str, Any], node_id: str, icon: object, screen: int = 0) -> dict[str, Any]:
    container: dict[str, Any] = {
        "id": f"{node_id}-box",
        "type": "View",
        "layout": {"x": 0, "y": 0, "width": 100, "height": 100},
        "children": [icon_node(node_id, icon)],
    }
    root = document["screens"][screen]["root"]
    root["children"] = [*root.get("children", []), container]
    return document


def icon_of(document: dict[str, Any], node_id: str) -> object:
    stack = [screen["root"] for screen in document["screens"]]
    while stack:
        node = stack.pop()
        if node["id"] == node_id:
            return node.get("props", {}).get("icon")
        stack.extend(node.get("children", []))
    raise AssertionError(f"Узла {node_id} нет в документе")
