from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Union, Dict, Any


class QuickLink(BaseModel):
    label: str
    href: str


class ChapterBase(BaseModel):
    id: str
    title: str
    description: str = ""
    order: int


class LabBase(BaseModel):
    id: str
    title: str
    description: str = ""
    order: int
    chapterId: str = ""


class ModuleItem(BaseModel):
    id: str
    title: str
    type: str  # "chapter" or "lab"


class Module(BaseModel):
    id: str
    title: str
    description: str = ""
    order: int
    chapters: List[ChapterBase] = []
    labs: List[LabBase] = []
    items: List[ModuleItem] = []


class Course(BaseModel):
    id: str
    title: str
    description: str = ""
    level: str = ""
    prerequisites: List[str] = []
    keyTakeaways: List[str] = []
    quickLinks: List[QuickLink] = []
    environment: List[str] = []
    totalModules: int = 0
    totalChapters: int = 0
    totalLabs: int = 0
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
    contentVersion: Optional[str] = None
    contentHash: Optional[str] = None
    modules: List[Module] = []

    # Keeping for backwards compatibility if needed, though they aren't strictly required based on DB.
    slug: Optional[str] = None


class Enrollment(BaseModel):
    userId: str
    courseId: str
    enrolledAt: datetime
    progress: Dict[str, Any] = {}
    lastAccessed: Optional[datetime] = None
    status: str = "in-progress"
    labsProgress: Dict[str, Any] = {}
