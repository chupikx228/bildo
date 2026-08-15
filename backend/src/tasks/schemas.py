from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

TaskStatus = Literal["deferred", "queued", "in_progress", "complete", "not_found"]


class TaskStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    status: TaskStatus
    result: object | None = None
    error: str | None = None
