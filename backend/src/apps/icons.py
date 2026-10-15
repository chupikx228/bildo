import copy
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, get_args

from src.apps.schemas import AppIconName

ICON_NAMES: tuple[str, ...] = get_args(AppIconName)

MAX_CLOSEST_ICONS = 3
TYPO_SIMILARITY = 0.7

LEGACY_ICON_NAMES: dict[str, AppIconName] = {
    "alert-circle": "circle-alert",
    "alert-triangle": "triangle-alert",
    "bar-chart-horizontal": "chart-bar",
    "check-circle": "circle-check",
    "check-circle-2": "circle-check",
    "circle-help": "circle-question-mark",
    "filter": "funnel",
    "fork-knife": "utensils",
    "help-circle": "circle-question-mark",
    "home": "house",
    "more-horizontal": "ellipsis",
    "more-vertical": "ellipsis-vertical",
    "pie-chart": "chart-pie",
    "trash-2": "trash",
    "unlock": "lock-open",
    "x-circle": "circle-x",
}

NAME_PARTS = re.compile(r"[-_\s]+")


@dataclass(frozen=True)
class InvalidIcon:
    screen_id: str | None
    node_id: str | None
    value: str


def normalize_icons(data: Any) -> tuple[Any, list[InvalidIcon]]:
    normalized = copy.deepcopy(data)
    invalid: list[InvalidIcon] = []
    _visit(normalized, None, invalid)
    return normalized, invalid


def closest_icon_names(value: str) -> list[str]:
    parts = _parts(value)
    if parts:
        shared = [(len(parts & _parts(name)) / len(parts | _parts(name)), name) for name in ICON_NAMES]
        ranked = sorted((item for item in shared if item[0] > 0), key=lambda item: -item[0])
        if ranked:
            return [name for _, name in ranked[:MAX_CLOSEST_ICONS]]
    typos = [(SequenceMatcher(None, value, name).ratio(), name) for name in ICON_NAMES]
    ranked = sorted((item for item in typos if item[0] >= TYPO_SIMILARITY), key=lambda item: -item[0])
    return [name for _, name in ranked[:MAX_CLOSEST_ICONS]]


def _parts(value: str) -> frozenset[str]:
    return frozenset(part for part in NAME_PARTS.split(value.lower()) if part)


def _visit(value: Any, screen_id: str | None, invalid: list[InvalidIcon]) -> None:
    if isinstance(value, list):
        for item in value:
            _visit(item, screen_id, invalid)
        return
    if not isinstance(value, dict):
        return
    node_id = value.get("id") if isinstance(value.get("id"), str) else None
    if isinstance(value.get("root"), dict):
        screen_id = node_id
    props = value.get("props")
    if isinstance(props, dict) and isinstance(props.get("icon"), str) and props["icon"] not in ICON_NAMES:
        icon: str = props["icon"]
        if icon in LEGACY_ICON_NAMES:
            props["icon"] = LEGACY_ICON_NAMES[icon]
        else:
            invalid.append(InvalidIcon(screen_id, node_id, icon))
            props["icon"] = None
    for child in value.values():
        _visit(child, screen_id, invalid)
