from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.apps.schemas import GenerationStatus
from src.database import Base


class App(Base):
    __tablename__ = "apps"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID | None] = mapped_column(index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt: Mapped[str | None] = mapped_column(nullable=True)
    document: Mapped[dict[str, object]] = mapped_column(JSONB)
    model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    revision: Mapped[int] = mapped_column(server_default="1")
    generation_status: Mapped[GenerationStatus] = mapped_column(String(16), server_default="pending")
    generation_error: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
