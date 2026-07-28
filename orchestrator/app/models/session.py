from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


class LabStatus(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


class LabSession(BaseModel):
    session_id: str = Field(default_factory=lambda: uuid4().hex[:12])
    lab_type: str
    lab_id: str = ""
    container_id: str | None = None
    container_name: str = ""
    status: LabStatus = LabStatus.STARTING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str | None = None
