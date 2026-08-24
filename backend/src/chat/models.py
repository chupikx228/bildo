from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.chat.schemas import ChatMessageRole
from src.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    app_id: Mapped[UUID] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), index=True)
    role: Mapped[ChatMessageRole] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text())
    proposed_document: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    accepted: Mapped[bool | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
