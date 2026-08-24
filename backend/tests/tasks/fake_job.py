from src.queue.base import JobStatusInfo


class FakeJobStatusReader:
    def __init__(self, states: dict[str, JobStatusInfo]) -> None:
        self._states = states

    async def read(self, job_id: str) -> JobStatusInfo:
        return self._states.get(job_id, JobStatusInfo(status="not_found"))
