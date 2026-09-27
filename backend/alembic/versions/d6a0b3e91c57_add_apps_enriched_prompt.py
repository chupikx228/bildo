from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "d6a0b3e91c57"
down_revision: str | Sequence[str] | None = "b8f3d0c25a91"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("apps", sa.Column("enriched_prompt", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("apps", "enriched_prompt")
