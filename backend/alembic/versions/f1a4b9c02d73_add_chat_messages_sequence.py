from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "f1a4b9c02d73"
down_revision: str | Sequence[str] | None = "e5f2a7c31b48"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column("sequence", sa.BigInteger(), sa.Identity(always=True), nullable=False),
    )
    op.create_unique_constraint(op.f("uq_chat_messages_sequence"), "chat_messages", ["sequence"])


def downgrade() -> None:
    op.drop_constraint(op.f("uq_chat_messages_sequence"), "chat_messages", type_="unique")
    op.drop_column("chat_messages", "sequence")
