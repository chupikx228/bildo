from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from src.database import async_session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
