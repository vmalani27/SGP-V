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
        """Return the full course TOC (from course.yaml + module.yaml)."""
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


def _lab_title_from_yaml(parsed: dict | None) -> str | None:
    """Extract the lab title from the top-level `title` field of a lab.yaml."""
    if parsed is None:
        return None
    title = parsed.get("title")
    return str(title) if title else None


def _chapter_title_from_markdown(content: str | None) -> str | None:
    """Extract the chapter title from the first H1 heading in markdown."""
    if not content:
        return None
    for line in content.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return None


class FilesystemProvider(ContentProvider):
    """Reads course content from a local directory tree.

    Canonical layout:
      courses/{id}/course.yaml                 course TOC (module refs)
      courses/{id}/modules/{mod}/module.yaml   module TOC (ordered `items`)
      courses/{id}/modules/{mod}/chapters/{ch}.md
      courses/{id}/modules/{mod}/labs/{lab}/lab.yaml
      courses/{id}/modules/{mod}/labs/{lab}/instructions.md
      environments/{ref}.yaml                  shared env definitions
    """

    def __init__(self, content_dir: str | Path):
        self.root = Path(content_dir)

    # ── helpers ──────────────────────────────────────────────────

    def _course_path(self, course_id: str) -> Path:
        return self.root / "courses" / course_id / "course.yaml"

    def _module_dir(self, course_id: str, mod_id: str) -> Path:
        return self.root / "courses" / course_id / "modules" / mod_id

    def _lab_files(self, course_dir: Path, mod_id: str, lab_id: str) -> tuple[Path, Path]:
        """Return (lab.yaml, instructions.md) for a lab."""
        labs_dir = course_dir / "modules" / mod_id / "labs"
        return (
            labs_dir / lab_id / "lab.yaml",
            labs_dir / lab_id / "instructions.md",
        )

    def _read_course(self, course_id: str) -> dict | None:
        """Read a course from course.yaml, resolving module.yaml references."""
        data = _read_yaml(self._course_path(course_id))
        if data is None:
            return None

        data["_source"] = "yaml"
        modules = []
        for mod_ref in data.get("modules", []):
            if isinstance(mod_ref, str):
                mod_data = _read_yaml(self._module_dir(course_id, mod_ref) / "module.yaml")
                if mod_data:
                    mod_data["id"] = mod_ref
                    self._finalize_module(mod_data, course_id, mod_ref)
                    modules.append(mod_data)
            elif isinstance(mod_ref, dict):
                modules.append(mod_ref)
        if modules:
            data["modules"] = modules
        return data

    def _finalize_module(self, mod_data: dict, course_id: str, mod_id: str) -> dict:
        """Ensure a module exposes `items` (ordered, mixed chapter/lab) plus
        derived `chapters`/`labs` arrays, so every consumer sees one consistent
        linear path."""
        items = self._resolve_module_items(mod_data, course_id, mod_id)
        mod_data["items"] = items
        mod_data["chapters"] = [it for it in items if it["type"] == "chapter"]
        mod_data["labs"] = [it for it in items if it["type"] == "lab"]
        return mod_data

    def _resolve_module_items(self, mod_data: dict, course_id: str, mod_id: str) -> list[dict]:
        """Build the ordered item list for a module from its explicit `items` list.
        Titles default to the lab.yaml `title` / chapter markdown H1."""
        items = []
        chapters_dir = self._module_dir(course_id, mod_id) / "chapters"
        labs_dir = self._module_dir(course_id, mod_id) / "labs"
        for ref in mod_data.get("items", []):
            if isinstance(ref, str):
                items.append({"type": "chapter", "id": ref, "title": ref})
                continue
            if not isinstance(ref, dict):
                continue
            item = dict(ref)
            item.setdefault("id", "")
            item.setdefault("type", "chapter")
            if not item.get("title"):
                if item["type"] == "lab":
                    item["title"] = (
                        _lab_title_from_yaml(_read_yaml(labs_dir / item["id"] / "lab.yaml"))
                        or item["id"]
                    )
                else:
                    item["title"] = (
                        _chapter_title_from_markdown(_read_text(chapters_dir / f"{item['id']}.md"))
                        or item["id"]
                    )
            items.append(item)
        return items

    def _find_lab_entry(self, course_data: dict, lab_id: str) -> tuple[dict | None, str | None]:
        """Find (lab_entry, module_id) for a given lab_id across all modules."""
        for module in course_data.get("modules", []):
            for lab in module.get("labs", []):
                if lab["id"] == lab_id:
                    return lab, module["id"]
        return None, None

    # ── public interface ─────────────────────────────────────────

    def list_courses(self) -> list[dict]:
        index_path = self.root / "index.json"
        data = _read_json(index_path)
        if data is None:
            return []
        return data.get("courses", [])

    def get_course(self, course_id: str) -> dict | None:
        return self._read_course(course_id)

    def get_chapter_content(self, course_id: str, chapter_id: str) -> str | None:
        course_data = self._read_course(course_id)
        if course_data is None:
            return None

        for module in course_data.get("modules", []):
            for chapter in module.get("chapters", []):
                cid = chapter["id"] if isinstance(chapter, dict) else chapter
                if cid == chapter_id:
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
        course_data = self._read_course(course_id)
        if course_data is None:
            return None

        lab_entry, mod_id = self._find_lab_entry(course_data, lab_id)
        if lab_entry is None:
            return None

        _, instructions_path = self._lab_files(
            self.root / "courses" / course_id, mod_id, lab_id
        )

        instructions = _read_text(instructions_path)
        return {
            "lab_id": lab_id,
            "title": lab_entry.get("title", ""),
            "module_id": mod_id,
            "chapter_id": lab_entry.get("chapterId", ""),
            "instructions": instructions,
        }

    def get_lab_config(self, course_id: str, lab_id: str) -> dict | None:
        course_data = self._read_course(course_id)
        if course_data is None:
            return None

        lab_entry, mod_id = self._find_lab_entry(course_data, lab_id)
        if lab_entry is None:
            return None

        yaml_path, _ = self._lab_files(self.root / "courses" / course_id, mod_id, lab_id)
        config = _read_yaml(yaml_path)
        if config is None:
            return None

        config["lab_id"] = lab_id
        config["module_id"] = mod_id

        # Resolve environment reference (string) to a shared environments/{ref}.yaml file
        env_ref = config.get("environment")
        if isinstance(env_ref, str):
            env_path = self.root / "environments" / f"{env_ref}.yaml"
            env_data = _read_yaml(env_path)
            if env_data:
                config["environment"] = env_data

        return config


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
