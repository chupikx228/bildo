"""make apps owner_id nullable

Revision ID: a1b2c3d4e5f6
Revises: cdd05b7da65c
Create Date: 2026-08-14 19:30:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "cdd05b7da65c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("apps", "owner_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.alter_column("apps", "owner_id", existing_type=sa.Uuid(), nullable=False)
