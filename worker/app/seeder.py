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

import yaml

from firebase_admin import firestore

from app.config import CONTENT_DIR

logger = logging.getLogger("worker.seeder")

_content_dir = Path(CONTENT_DIR)


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


def _lab_title_from_yaml(parsed: dict | None, lab_ref: str) -> str | None:
    """Extract lab title from YAML — supports flat (top-level title) and
    old monolithic format (title nested in phases[*].labs[*].title)."""
    if parsed is None:
        return None
    title = parsed.get("title")
    if title:
        return str(title)
    # Old monolithic format: phases[x].labs[y].title
    for phase in parsed.get("phases", []):
        for sub_lab in phase.get("labs", []):
            if sub_lab.get("id") == lab_ref:
                return sub_lab.get("title")
    return None


def _title_from_md(md_path: Path) -> str | None:
    """Extract title from '# ' heading in markdown."""
    try:
        for line in md_path.read_text(encoding="utf-8").split("\n"):
            if line.startswith("# "):
                return line[2:].strip()
    except OSError:
        pass
    return None


def _read_course_data(course_dir: Path) -> dict | None:
    """Read course from course.yaml (new) or course.json (old)."""
    yaml_path = course_dir / "course.yaml"
    data = _read_yaml(yaml_path)
    if data:
        data["_source"] = "yaml"
        modules = []
        for mod_ref in data.get("modules", []):
            if isinstance(mod_ref, str):
                mod_path = course_dir / "modules" / mod_ref / "module.yaml"
                mod_data = _read_yaml(mod_path)
                if mod_data:
                    mod_data["id"] = mod_ref
                    # Resolve lab references
                    labs = []
                    for lab_ref in mod_data.get("labs", []):
                        if isinstance(lab_ref, str):
                            lab_entry = {"id": lab_ref, "title": lab_ref}
                            # Try new hierarchical yaml
                            lab_yaml = course_dir / "modules" / mod_ref / "labs" / lab_ref / "lab.yaml"
                            parsed = _read_yaml(lab_yaml)
                            title = _lab_title_from_yaml(parsed, lab_ref)
                            if not title:
                                # Try old flat yaml
                                flat_yaml = course_dir / "modules" / mod_ref / "labs" / f"{lab_ref}.yaml"
                                flat_parsed = _read_yaml(flat_yaml)
                                title = _lab_title_from_yaml(flat_parsed, lab_ref)
                            if not title:
                                # Try markdown heading
                                md_path = course_dir / "modules" / mod_ref / "labs" / f"{lab_ref}.md"
                                title = _title_from_md(md_path)
                            if title:
                                lab_entry["title"] = title
                        elif isinstance(lab_ref, dict):
                            lab_entry = lab_ref
                        else:
                            continue
                        labs.append(lab_entry)
                    mod_data["labs"] = labs
                    modules.append(mod_data)
                else:
                    modules.append({"id": mod_ref, "title": mod_ref, "labs": [], "chapters": []})
            elif isinstance(mod_ref, dict):
                modules.append(mod_ref)
        if modules:
            data["modules"] = modules
        return data
    json_path = course_dir / "course.json"
    data = _read_json(json_path)
    if data:
        data["_source"] = "json"
    return data


def _content_hash(course_dir: Path) -> str:
    """Hash course.yaml (or course.json) + all lab/module YAMLs to detect content change."""
    h = hashlib.sha256()

    for fname in ["course.yaml", "course.json"]:
        fp = course_dir / fname
        if fp.exists():
            h.update(fp.read_bytes())
            break

    modules_dir = course_dir / "modules"
    if modules_dir.exists():
        for mod_dir in sorted(modules_dir.iterdir()):
            if not mod_dir.is_dir():
                continue
            mod_yaml = mod_dir / "module.yaml"
            if mod_yaml.exists():
                h.update(mod_yaml.read_bytes())
            labs_dir = mod_dir / "labs"
            if labs_dir.exists():
                for yaml_file in sorted(labs_dir.glob("*.yaml")):
                    h.update(yaml_file.read_bytes())
                for sub_dir in sorted(labs_dir.iterdir()):
                    if sub_dir.is_dir():
                        sub_yaml = sub_dir / "lab.yaml"
                        if sub_yaml.exists():
                            h.update(sub_yaml.read_bytes())

    return h.hexdigest()[:16]


def sync_courses(db: firestore.Client) -> dict:
    """
    Read index.json + course content (yaml or json), upsert to Firestore.
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
        course_data = _read_course_data(course_dir)
        if course_data is None:
            errors.append(f"courses/{cid}: neither course.yaml nor course.json found")
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
                cid_val = ch["id"] if isinstance(ch, dict) else ch
                ctitle = ch.get("title", cid_val) if isinstance(ch, dict) else cid_val
                chapters.append({
                    "id": cid_val,
                    "title": ctitle,
                    "description": "",
                    "order": 0,
                })
                total_chapters += 1

            labs = []
            for lab in mod.get("labs", []):
                lid = lab["id"] if isinstance(lab, dict) else lab
                labs.append({
                    "id": lid,
                    "title": lab.get("title", "") if isinstance(lab, dict) else "",
                    "description": "",
                    "chapterId": "",
                    "order": 0,
                })
                total_labs += 1

            modules.append({
                "id": mod.get("id", ""),
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
