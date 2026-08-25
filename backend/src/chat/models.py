from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, ForeignKey, ForeignKeyConstraint, Identity, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.chat.schemas import ChatMessageRole
from src.database import Base

REPLY_UNIQUE_CONSTRAINT = "uq_chat_messages_in_reply_to_id"
APP_MESSAGE_UNIQUE_CONSTRAINT = "uq_chat_messages_app_id_id"
REPLY_FOREIGN_KEY_CONSTRAINT = "fk_chat_messages_app_id_in_reply_to_id_chat_messages"


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint("in_reply_to_id", name=REPLY_UNIQUE_CONSTRAINT),
        UniqueConstraint("app_id", "id", name=APP_MESSAGE_UNIQUE_CONSTRAINT),
        ForeignKeyConstraint(
            ["app_id", "in_reply_to_id"],
            ["chat_messages.app_id", "chat_messages.id"],
            name=REPLY_FOREIGN_KEY_CONSTRAINT,
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    sequence: Mapped[int] = mapped_column(BigInteger, Identity(always=True), unique=True)
    app_id: Mapped[UUID] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), index=True)
    role: Mapped[ChatMessageRole] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text())
    proposed_document: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    accepted: Mapped[bool | None] = mapped_column(nullable=True)
    in_reply_to_id: Mapped[UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.clock_timestamp())
