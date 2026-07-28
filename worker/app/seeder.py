"""
Firestore seeder — syncs validated v2 content to the courses collection.
Idempotent: only writes when data has changed.

Synced document shape (Firestore courses collection):
{
  "id": "git-fundamentals",
  "title": "Git Fundamentals",
  "description": "...",
  "slug": "git-fundamentals",
  "level": "beginner",
  "estimatedHours": 8,
  "modules": [
    {
      "id": "git-basics",
      "title": "Git Basics",
      "description": "...",
      "order": 1,
      "chapters": [
        { "id": "chapter-1", "title": "...", "description": "...", "order": 1 }
      ],
      "labs": [
        { "id": "lab-1", "title": "...", "description": "...", "chapterId": "chapter-1", "order": 1 }
      ]
    }
  ],
  "totalChapters": 10,
  "totalLabs": 10,
  "contentHash": "abc123...",
  "updatedAt": <timestamp>
}
"""

from __future__ import annotations

import json
import hashlib
import logging
from datetime import datetime
from pathlib import Path

from firebase_admin import firestore

from app.config import CONTENT_DIR

logger = logging.getLogger("worker.seeder")

_content_dir = Path(CONTENT_DIR)


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _content_hash(course_dir: Path) -> str:
    """Hash course.json + all lab YAMLs to detect any content change."""
    h = hashlib.sha256()

    course_json = course_dir / "course.json"
    if course_json.exists():
        h.update(course_json.read_bytes())

    modules_dir = course_dir / "modules"
    if modules_dir.exists():
        for mod_dir in sorted(modules_dir.iterdir()):
            if not mod_dir.is_dir():
                continue
            labs_dir = mod_dir / "labs"
            if labs_dir.exists():
                for yaml_file in sorted(labs_dir.glob("*.yaml")):
                    h.update(yaml_file.read_bytes())

    return h.hexdigest()[:16]


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def sync_courses(db: firestore.Client) -> dict:
    """
    Read index.json + each course.json (v2 TOC), upsert to Firestore.
    Returns a summary dict with counts.
    """
    index_path = _content_dir / "index.json"
    catalog = _read_json(index_path)
    if catalog is None:
        return {"synced": 0, "skipped": 0, "errors": ["index.json not found or invalid"]}

    courses_ref = db.collection("courses")
    existing = {doc.id: doc.to_dict() for doc in courses_ref.stream()}

    synced = 0
    skipped = 0
    errors: list[str] = []

    for entry in catalog.get("courses", []):
        cid = entry.get("id")
        if not cid:
            continue

        course_dir = _content_dir / "courses" / cid
        course_json = course_dir / "course.json"
        course_data = _read_json(course_json)
        if course_data is None:
            errors.append(f"courses/{cid}/course.json: not found or invalid")
            continue

        content_hash = _content_hash(course_dir)

        existing_doc = existing.get(cid)
        if existing_doc and existing_doc.get("contentHash") == content_hash:
            skipped += 1
            continue

        # Build full module structure for Firestore
        modules = []
        total_chapters = 0
        total_labs = 0

        for mod in course_data.get("modules", []):
            chapters = []
            for ch in mod.get("chapters", []):
                chapters.append({
                    "id": ch["id"],
                    "title": ch.get("title", ""),
                    "description": ch.get("description", ""),
                    "order": ch.get("order", 0),
                })
                total_chapters += 1

            labs = []
            for lab in mod.get("labs", []):
                labs.append({
                    "id": lab["id"],
                    "title": lab.get("title", ""),
                    "description": lab.get("description", ""),
                    "chapterId": lab.get("chapterId", ""),
                    "order": lab.get("order", 0),
                })
                total_labs += 1

            modules.append({
                "id": mod["id"],
                "title": mod.get("title", ""),
                "description": mod.get("description", ""),
                "order": mod.get("order", 0),
                "chapters": chapters,
                "labs": labs,
            })

        doc_data = {
            "id": cid,
            "title": course_data.get("title", entry.get("title", "")),
            "description": course_data.get("description", entry.get("description", "")),
            "slug": cid,
            "level": course_data.get("level", entry.get("level", "")),
            "estimatedHours": course_data.get("estimatedHours", 0),
            "modules": modules,
            "totalChapters": total_chapters,
            "totalLabs": total_labs,
            "contentHash": content_hash,
            "updatedAt": datetime.utcnow(),
        }

        if not existing_doc:
            doc_data["createdAt"] = datetime.utcnow()

        courses_ref.document(cid).set(doc_data, merge=True)
        synced += 1
        logger.info("Synced course: %s (%d chapters, %d labs)", cid, total_chapters, total_labs)

    # Remove courses from Firestore that no longer exist in content
    content_ids = {e.get("id") for e in catalog.get("courses", []) if e.get("id")}
    for orphan_id in existing:
        if orphan_id not in content_ids:
            courses_ref.document(orphan_id).delete()
            logger.info("Removed orphaned course: %s", orphan_id)
            synced += 1

    return {"synced": synced, "skipped": skipped, "errors": errors}
