"""
Content provider abstraction.

Currently: FilesystemProvider reads from a local directory (content-v2/ mounted as volume).
Future:    S3Provider reads from an S3 bucket (triggered by env var CONTENT_SOURCE=s3).

To add a new provider:
  1. Create a class implementing ContentProvider
  2. Add a branch in get_content_provider() at the bottom of this file
  3. No router changes needed — the interface is the same
"""

from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path

import yaml

logger = logging.getLogger("backend.content_provider")


class ContentProvider(ABC):
    """Abstract interface for reading course content."""

    @abstractmethod
    def list_courses(self) -> list[dict]:
        """Return the course catalog (from index.json)."""
        ...

    @abstractmethod
    def get_course(self, course_id: str) -> dict | None:
        """Return the full course TOC (from course.json)."""
        ...

    @abstractmethod
    def get_chapter_content(self, course_id: str, chapter_id: str) -> str | None:
        """Return raw markdown for a chapter."""
        ...

    @abstractmethod
    def get_lab_instructions(self, course_id: str, lab_id: str) -> dict | None:
        """Return {lab_id, title, module_id, instructions} for a lab."""
        ...

    @abstractmethod
    def get_lab_config(self, course_id: str, lab_id: str) -> dict | None:
        """Return the parsed lab YAML (environment + validation tasks)."""
        ...


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _read_yaml(path: Path) -> dict | None:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except (yaml.YAMLError, OSError):
        return None


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


class FilesystemProvider(ContentProvider):
    """Reads course content from a local directory tree."""

    def __init__(self, content_dir: str | Path):
        self.root = Path(content_dir)

    def list_courses(self) -> list[dict]:
        index_path = self.root / "index.json"
        data = _read_json(index_path)
        if data is None:
            return []
        return data.get("courses", [])

    def get_course(self, course_id: str) -> dict | None:
        course_json = self.root / "courses" / course_id / "course.json"
        return _read_json(course_json)

    def get_chapter_content(self, course_id: str, chapter_id: str) -> str | None:
        course_data = self.get_course(course_id)
        if course_data is None:
            return None

        for module in course_data.get("modules", []):
            for chapter in module.get("chapters", []):
                if chapter["id"] == chapter_id:
                    mod_id = module["id"]
                    md_path = (
                        self.root
                        / "courses"
                        / course_id
                        / "modules"
                        / mod_id
                        / "chapters"
                        / f"{chapter_id}.md"
                    )
                    return _read_text(md_path)

        return None

    def get_lab_instructions(self, course_id: str, lab_id: str) -> dict | None:
        course_data = self.get_course(course_id)
        if course_data is None:
            return None

        for module in course_data.get("modules", []):
            for lab in module.get("labs", []):
                if lab["id"] == lab_id:
                    mod_id = module["id"]
                    md_path = (
                        self.root
                        / "courses"
                        / course_id
                        / "modules"
                        / mod_id
                        / "labs"
                        / f"{lab_id}.md"
                    )
                    instructions = _read_text(md_path)
                    return {
                        "lab_id": lab_id,
                        "title": lab.get("title", ""),
                        "module_id": mod_id,
                        "chapter_id": lab.get("chapterId", ""),
                        "instructions": instructions,
                    }

        return None

    def get_lab_config(self, course_id: str, lab_id: str) -> dict | None:
        course_data = self.get_course(course_id)
        if course_data is None:
            return None

        for module in course_data.get("modules", []):
            for lab in module.get("labs", []):
                if lab["id"] == lab_id:
                    mod_id = module["id"]
                    yaml_path = (
                        self.root
                        / "courses"
                        / course_id
                        / "modules"
                        / mod_id
                        / "labs"
                        / f"{lab_id}.yaml"
                    )
                    config = _read_yaml(yaml_path)
                    if config is None:
                        return None
                    config["lab_id"] = lab_id
                    config["module_id"] = mod_id
                    return config

        return None


# ─── Provider singleton ───────────────────────────────────────────────────────

_provider: ContentProvider | None = None


def get_content_provider() -> ContentProvider:
    """Return the active content provider (singleton)."""
    global _provider
    if _provider is not None:
        return _provider

    source = os.environ.get("CONTENT_SOURCE", "filesystem")

    if source == "filesystem":
        content_dir = os.environ.get("CONTENT_DIR", "/app/content")
        _provider = FilesystemProvider(content_dir)
        logger.info("Content provider: filesystem (%s)", content_dir)
    else:
        raise ValueError(f"Unknown CONTENT_SOURCE: {source!r}. Valid: filesystem")

    return _provider
