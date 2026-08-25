from typing import Protocol


class Transaction(Protocol):
    async def commit(self) -> None: ...
