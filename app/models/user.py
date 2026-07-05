from pydantic import BaseModel
from datetime import datetime


class UserProfile(BaseModel):
    uid: str
    email: str
    displayName: str
    createdAt: datetime | None = None
    lastLogin: datetime | None = None
    enrolledCourses: list[str] = []
    profileComplete: bool = False


class UserSyncResponse(BaseModel):
    uid: str
    email: str
    displayName: str
    enrolledCourses: list[str]
    profileComplete: bool
    isNew: bool
