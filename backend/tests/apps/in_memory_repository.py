from datetime import UTC, datetime
from uuid import UUID

from src.apps.models import App
from src.apps.schemas import AppDocument


class InMemoryAppRepository:
    def __init__(self) -> None:
        self._apps: dict[UUID, App] = {}

    async def list_all(self) -> list[App]:
        return sorted(self._apps.values(), key=lambda app: app.updated_at, reverse=True)

    async def get(self, app_id: UUID) -> App | None:
        return self._apps.get(app_id)

    async def create(self, name: str, prompt: str | None, document: AppDocument) -> App:
        now = datetime.now(UTC)
        app = App(
            id=UUID(document.id),
            name=name,
            prompt=prompt,
            document=document.model_dump(mode="json", by_alias=True),
            created_at=now,
            updated_at=now,
        )
        self._apps[app.id] = app
        return app

    async def update_document(self, app_id: UUID, document: AppDocument) -> App | None:
        app = self._apps.get(app_id)
        if app is None:
            return None
        app.document = document.model_dump(mode="json", by_alias=True)
        app.name = document.name
        app.slug = document.slug
        app.updated_at = datetime.now(UTC)
        return app

    async def delete(self, app_id: UUID) -> bool:
        if app_id not in self._apps:
            return False
        del self._apps[app_id]
        return True
