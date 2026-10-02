import json
from collections.abc import Sequence
from typing import Any

from alembic import op
import sqlalchemy as sa

revision: str = "ecaed9c13144"
down_revision: str | Sequence[str] | None = "e1ab16a64eeb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (("apps", "document"), ("chat_messages", "proposed_document"))


def roots_as_screen_ids(document: Any) -> list[str] | None:
    if not isinstance(document, dict):
        return None
    navigation = document.get("navigation")
    screens = document.get("screens")
    if not isinstance(navigation, dict) or not isinstance(screens, list):
        return None
    roots = navigation.get("roots")
    if not isinstance(roots, list):
        return None
    screens = [screen for screen in screens if isinstance(screen, dict) and isinstance(screen.get("id"), str)]
    ids = [screen["id"] for screen in screens]
    id_by_route: dict[str, str] = {}
    for screen in screens:
        route = screen.get("route")
        if isinstance(route, str):
            id_by_route.setdefault(route, screen["id"])
    resolved: list[str] = []
    for root in roots:
        if not isinstance(root, str):
            continue
        screen_id = root if root in ids else id_by_route.get(root)
        if screen_id is not None and screen_id not in resolved:
            resolved.append(screen_id)
    if not resolved:
        resolved = list(dict.fromkeys(ids))
    return None if resolved == roots else resolved


def upgrade() -> None:
    connection = op.get_bind()
    for table, column in TABLES:
        rows = connection.execute(sa.text(f"SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL"))  # noqa: S608
        for row_id, document in rows.all():
            roots = roots_as_screen_ids(document)
            if roots is None:
                continue
            connection.execute(
                sa.text(
                    f"UPDATE {table} SET {column} = jsonb_set({column}, '{{navigation,roots}}', CAST(:roots AS jsonb)) "  # noqa: S608
                    "WHERE id = :id"
                ),
                {"id": row_id, "roots": json.dumps(roots, ensure_ascii=False)},
            )


def downgrade() -> None:
    pass
