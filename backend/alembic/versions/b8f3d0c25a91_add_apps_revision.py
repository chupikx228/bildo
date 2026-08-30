from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "b8f3d0c25a91"
down_revision: str | Sequence[str] | None = "c4d9e1f70a26"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("apps", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.execute(
        """
        UPDATE apps
        SET document = jsonb_set(document, '{revision}', to_jsonb(revision))
        WHERE NOT document ? 'revision'
        """
    )
    op.execute(
        """
        UPDATE chat_messages
        SET proposed_document = jsonb_set(proposed_document, '{revision}', '1'::jsonb)
        WHERE proposed_document IS NOT NULL AND NOT proposed_document ? 'revision'
        """
    )


def downgrade() -> None:
    op.execute("UPDATE apps SET document = document - 'revision'")
    op.execute(
        "UPDATE chat_messages SET proposed_document = proposed_document - 'revision' WHERE proposed_document IS NOT NULL"
    )
    op.drop_column("apps", "revision")
