from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.apps.dependencies import get_app_service
from src.apps.service import AppService
from src.chat.repository import SqlAlchemyChatRepository
from src.chat.service import ChatService
from src.dependencies import get_session


def get_chat_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    app_service: Annotated[AppService, Depends(get_app_service)],
) -> ChatService:
    return ChatService(SqlAlchemyChatRepository(session), app_service)


ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
