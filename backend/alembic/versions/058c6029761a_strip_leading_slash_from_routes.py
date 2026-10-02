import copy
import json
from collections.abc import Iterator, Sequence
from typing import Any

from alembic import op
import sqlalchemy as sa

revision: str = "058c6029761a"
down_revision: str | Sequence[str] | None = "ecaed9c13144"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (("apps", "document"), ("chat_messages", "proposed_document"))

START_ROUTE = "index"
ACTION_LISTS = ("onPress", "onChange")


def bare_route(route: str) -> str:
    return route.lstrip("/") or START_ROUTE


def unique_route(route: str, taken: set[str]) -> str:
    candidate, suffix = route, 2
    while candidate in taken:
        candidate, suffix = f"{route}-{suffix}", suffix + 1
    return candidate


def walk(node: Any) -> Iterator[dict[str, Any]]:
    if not isinstance(node, dict):
        return
    yield node
    children = node.get("children")
    if isinstance(children, list):
        for child in children:
            yield from walk(child)


def rewrite_targets(node: dict[str, Any], renamed: dict[str, str]) -> None:
    props = node.get("props")
    if not isinstance(props, dict):
        return
    href = props.get("href")
    if isinstance(href, str) and href in renamed:
        props["href"] = renamed[href]
    for key in ACTION_LISTS:
        actions = props.get(key)
        if not isinstance(actions, list):
            continue
        for action in actions:
            if not isinstance(action, dict) or action.get("type") != "navigate":
                continue
            target = action.get("route")
            if isinstance(target, str) and target in renamed:
                action["route"] = renamed[target]


def routes_without_leading_slash(document: Any) -> dict[str, Any] | None:
    if not isinstance(document, dict) or not isinstance(document.get("screens"), list):
        return None
    migrated = copy.deepcopy(document)
    screens = [screen for screen in migrated["screens"] if isinstance(screen, dict)]
    taken = {
        screen["route"]
        for screen in screens
        if isinstance(screen.get("route"), str) and not screen["route"].startswith("/")
    }
    renamed: dict[str, str] = {}
    for screen in screens:
        route = screen.get("route")
        if not isinstance(route, str) or not route.startswith("/"):
            continue
        new_route = unique_route(bare_route(route), taken)
        taken.add(new_route)
        renamed.setdefault(route, new_route)
        screen["route"] = new_route
    if not renamed:
        return None
    for screen in screens:
        for node in walk(screen.get("root")):
            rewrite_targets(node, renamed)
    return migrated


def upgrade() -> None:
    connection = op.get_bind()
    for table, column in TABLES:
        rows = connection.execute(sa.text(f"SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL"))  # noqa: S608
        for row_id, document in rows.all():
            migrated = routes_without_leading_slash(document)
            if migrated is None:
                continue
            connection.execute(
                sa.text(f"UPDATE {table} SET {column} = CAST(:document AS jsonb) WHERE id = :id"),  # noqa: S608
                {"id": row_id, "document": json.dumps(migrated, ensure_ascii=False)},
            )


def downgrade() -> None:
    pass
