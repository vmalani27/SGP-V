from datetime import datetime, timedelta, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field, computed_field

from app.config import LAB_TIMEOUT_MINUTES


class LabStatus(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


def parse_created_at(value: str | None) -> datetime:
    """Parse a Docker container 'Created' timestamp into an aware datetime.

    Docker emits ISO-8601 with a trailing 'Z'. Falls back to "now" so a
    missing/invalid value never crashes session recovery.
    """
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


class LabSession(BaseModel):
    session_id: str = Field(default_factory=lambda: uuid4().hex[:12])
    lab_type: str
    lab_id: str = ""
    container_id: str | None = None
    container_name: str = ""
    status: LabStatus = LabStatus.STARTING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def expires_at(self) -> datetime:
        """Server-authoritative deadline (created_at + the lab lifetime)."""
        return self.created_at + timedelta(minutes=LAB_TIMEOUT_MINUTES)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def remaining_seconds(self) -> int:
        return max(0, int((self.expires_at - datetime.now(timezone.utc)).total_seconds()))
