from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "e1ab16a64eeb"
down_revision: str | Sequence[str] | None = "d6a0b3e91c57"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FONT_FAMILIES = [
    "System",
    "Inter",
    "Manrope",
    "Montserrat",
    "Rubik",
    "Nunito",
    "Comfortaa",
    "Unbounded",
    "Lora",
    "PT Serif",
    "JetBrains Mono",
]

NORMALIZE_APPS = """
    UPDATE apps AS target
    SET document = jsonb_set(
        jsonb_set(target.document, '{theme,fontBody}', to_jsonb(fonts.body)),
        '{theme,fontHeading}',
        to_jsonb(fonts.heading)
    )
    FROM (
        SELECT
            id,
            COALESCE(
                (SELECT family FROM unnest(CAST(:families AS text[])) AS family
                 WHERE lower(family) = lower(document->'theme'->>'fontBody')),
                'System'
            ) AS body,
            COALESCE(
                (SELECT family FROM unnest(CAST(:families AS text[])) AS family
                 WHERE lower(family) = lower(document->'theme'->>'fontHeading')),
                'System'
            ) AS heading
        FROM apps
        WHERE jsonb_typeof(document->'theme') = 'object'
    ) AS fonts
    WHERE target.id = fonts.id
      AND (
        (target.document->'theme'->>'fontBody') IS DISTINCT FROM fonts.body
        OR (target.document->'theme'->>'fontHeading') IS DISTINCT FROM fonts.heading
      )
"""

NORMALIZE_PROPOSALS = """
    UPDATE chat_messages AS target
    SET proposed_document = jsonb_set(
        jsonb_set(target.proposed_document, '{theme,fontBody}', to_jsonb(fonts.body)),
        '{theme,fontHeading}',
        to_jsonb(fonts.heading)
    )
    FROM (
        SELECT
            id,
            COALESCE(
                (SELECT family FROM unnest(CAST(:families AS text[])) AS family
                 WHERE lower(family) = lower(proposed_document->'theme'->>'fontBody')),
                'System'
            ) AS body,
            COALESCE(
                (SELECT family FROM unnest(CAST(:families AS text[])) AS family
                 WHERE lower(family) = lower(proposed_document->'theme'->>'fontHeading')),
                'System'
            ) AS heading
        FROM chat_messages
        WHERE jsonb_typeof(proposed_document->'theme') = 'object'
    ) AS fonts
    WHERE target.id = fonts.id
      AND (
        (target.proposed_document->'theme'->>'fontBody') IS DISTINCT FROM fonts.body
        OR (target.proposed_document->'theme'->>'fontHeading') IS DISTINCT FROM fonts.heading
      )
"""


def upgrade() -> None:
    for statement in (NORMALIZE_APPS, NORMALIZE_PROPOSALS):
        op.execute(sa.text(statement).bindparams(families=FONT_FAMILIES))


def downgrade() -> None:
    pass
