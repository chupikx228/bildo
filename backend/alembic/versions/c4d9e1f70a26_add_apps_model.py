from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "c4d9e1f70a26"
down_revision: str | Sequence[str] | None = "a2c7e6b18f04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("apps", sa.Column("model", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("apps", "model")
