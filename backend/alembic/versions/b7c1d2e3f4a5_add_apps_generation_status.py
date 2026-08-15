"""add apps generation status

Revision ID: b7c1d2e3f4a5
Revises: a1b2c3d4e5f6
Create Date: 2026-08-15 12:40:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "b7c1d2e3f4a5"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "apps",
        sa.Column("generation_status", sa.String(length=16), server_default="pending", nullable=False),
    )
    op.add_column("apps", sa.Column("generation_error", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("apps", "generation_error")
    op.drop_column("apps", "generation_status")
