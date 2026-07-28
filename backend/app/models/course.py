from pydantic import BaseModel
from datetime import datetime


class Course(BaseModel):
    id: str
    title: str
    description: str
    slug: str
    modules: int
    level: str
    createdAt: datetime | None = None


class Enrollment(BaseModel):
    userId: str
    courseId: str
    enrolledAt: datetime
    progress: dict = {}
    lastAccessed: datetime | None = None
    status: str = "in-progress"
