from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "e5f2a7c31b48"
down_revision: str | Sequence[str] | None = "d3e8f1a29b7c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("in_reply_to_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_chat_messages_in_reply_to_id_chat_messages"),
        "chat_messages",
        "chat_messages",
        ["in_reply_to_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        op.f("uq_chat_messages_in_reply_to_id"),
        "chat_messages",
        ["in_reply_to_id"],
    )
    op.alter_column("chat_messages", "created_at", server_default=sa.text("clock_timestamp()"))


def downgrade() -> None:
    op.alter_column("chat_messages", "created_at", server_default=sa.text("now()"))
    op.drop_constraint(op.f("uq_chat_messages_in_reply_to_id"), "chat_messages", type_="unique")
    op.drop_constraint(op.f("fk_chat_messages_in_reply_to_id_chat_messages"), "chat_messages", type_="foreignkey")
    op.drop_column("chat_messages", "in_reply_to_id")
