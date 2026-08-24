class InMemoryTransaction:
    def __init__(self, events: list[str] | None = None) -> None:
        self.commits = 0
        self._events = events

    async def commit(self) -> None:
        self.commits += 1
        if self._events is not None:
            self._events.append("commit")


class FailingTransaction:
    def __init__(self, events: list[str] | None = None) -> None:
        self.commits = 0
        self._events = events

    async def commit(self) -> None:
        self.commits += 1
        if self._events is not None:
            self._events.append("commit")
        raise RuntimeError("не удалось закоммитить транзакцию")
