from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_session
from src.transaction.base import Transaction
from src.transaction.session_transaction import SessionTransaction


def get_transaction(session: Annotated[AsyncSession, Depends(get_session)]) -> Transaction:
    return SessionTransaction(session)


TransactionDep = Annotated[Transaction, Depends(get_transaction)]
