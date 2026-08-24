from collections.abc import Sequence

from alembic import op

DETACH_CROSS_APP_REPLIES = """
    UPDATE chat_messages AS reply
    SET in_reply_to_id = NULL
    WHERE reply.in_reply_to_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM chat_messages AS anchor
          WHERE anchor.id = reply.in_reply_to_id
            AND anchor.app_id = reply.app_id
      )
"""

revision: str = "a2c7e6b18f04"
down_revision: str | Sequence[str] | None = "f1a4b9c02d73"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(op.f("uq_chat_messages_app_id_id"), "chat_messages", ["app_id", "id"])
    op.drop_constraint(op.f("fk_chat_messages_in_reply_to_id_chat_messages"), "chat_messages", type_="foreignkey")
    op.execute(DETACH_CROSS_APP_REPLIES)
    op.create_foreign_key(
        op.f("fk_chat_messages_app_id_in_reply_to_id_chat_messages"),
        "chat_messages",
        "chat_messages",
        ["app_id", "in_reply_to_id"],
        ["app_id", "id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_chat_messages_app_id_in_reply_to_id_chat_messages"),
        "chat_messages",
        type_="foreignkey",
    )
    op.create_foreign_key(
        op.f("fk_chat_messages_in_reply_to_id_chat_messages"),
        "chat_messages",
        "chat_messages",
        ["in_reply_to_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(op.f("uq_chat_messages_app_id_id"), "chat_messages", type_="unique")
