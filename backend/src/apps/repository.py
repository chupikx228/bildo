from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.models import App
from src.apps.schemas import AppDocument


class AppRepository(Protocol):
    async def list_all(self) -> list[App]: ...

    async def get(self, app_id: UUID) -> App | None: ...

    async def create(self, name: str, prompt: str | None, document: AppDocument) -> App: ...

    async def update_document(self, app_id: UUID, document: AppDocument) -> App | None: ...

    async def delete(self, app_id: UUID) -> bool: ...


class SqlAlchemyAppRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self) -> list[App]:
        stmt = select(App).order_by(App.updated_at.desc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, app_id: UUID) -> App | None:
        return await self._session.get(App, app_id)

    async def create(self, name: str, prompt: str | None, document: AppDocument) -> App:
        app = App(
            id=UUID(document.id),
            name=name,
            prompt=prompt,
            document=document.model_dump(mode="json", by_alias=True),
        )
        self._session.add(app)
        await self._session.flush()
        return app

    async def update_document(self, app_id: UUID, document: AppDocument) -> App | None:
        app = await self._session.get(App, app_id)
        if app is None:
            return None
        app.document = document.model_dump(mode="json", by_alias=True)
        app.name = document.name
        app.slug = document.slug
        await self._session.flush()
        return app

    async def delete(self, app_id: UUID) -> bool:
        app = await self._session.get(App, app_id)
        if app is None:
            return False
        await self._session.delete(app)
        return True
