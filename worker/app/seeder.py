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

import io
import json
import hashlib
import logging
import shutil
import tarfile
from datetime import datetime
from pathlib import Path

import yaml

from firebase_admin import firestore

from app.config import AWS_ENDPOINT_URL, AWS_REGION, S3_BUCKET

logger = logging.getLogger("worker.seeder")


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


def _lab_title_from_yaml(parsed: dict | None) -> str | None:
    """Extract the lab title from the top-level `title` field of a lab.yaml."""
    if parsed is None:
        return None
    title = parsed.get("title")
    return str(title) if title else None


def _title_from_md(md_path: Path) -> str | None:
    """Extract title from '# ' heading in markdown."""
    try:
        for line in md_path.read_text(encoding="utf-8").split("\n"):
            if line.startswith("# "):
                return line[2:].strip()
    except OSError:
        pass
    return None


def _derive_module_items(mod_data: dict) -> dict:
    """Derive `chapters`/`labs` arrays from the explicit `items` list (canonical)."""
    items = []
    for ref in mod_data.get("items", []):
        if isinstance(ref, dict):
            item = dict(ref)
            item.setdefault("type", "chapter")
            item.setdefault("id", "")
            items.append(item)
    mod_data["items"] = items
    mod_data["chapters"] = [it for it in items if it["type"] == "chapter"]
    mod_data["labs"] = [it for it in items if it["type"] == "lab"]
    return mod_data


def _resolve_module_titles(mod_data: dict, course_dir: Path, mod_id: str) -> dict:
    """Resolve chapter/lab titles from markdown H1 headings and lab.yaml `title`."""
    chapters_dir = course_dir / "modules" / mod_id / "chapters"
    labs_dir = course_dir / "modules" / mod_id / "labs"
    for ch in mod_data.get("chapters", []):
        if isinstance(ch, dict) and not ch.get("title"):
            ch["title"] = _title_from_md(chapters_dir / f"{ch.get('id', '')}.md") or ch.get("id", "")
    for lab in mod_data.get("labs", []):
        if isinstance(lab, dict) and not lab.get("title"):
            lab_id = lab.get("id", "")
            title = _lab_title_from_yaml(_read_yaml(labs_dir / lab_id / "lab.yaml"))
            if not title:
                title = _title_from_md(labs_dir / lab_id / "instructions.md")
            lab["title"] = title or lab_id
    return mod_data


def _read_course_data(course_dir: Path) -> dict | None:
    """Read course from course.yaml, resolving module.yaml references."""
    data = _read_yaml(course_dir / "course.yaml")
    if data is None:
        return None

    data["_source"] = "yaml"
    modules = []
    for mod_ref in data.get("modules", []):
        if isinstance(mod_ref, str):
            mod_path = course_dir / "modules" / mod_ref / "module.yaml"
            mod_data = _read_yaml(mod_path)
            if mod_data:
                mod_data["id"] = mod_ref
                _derive_module_items(mod_data)
                _resolve_module_titles(mod_data, course_dir, mod_ref)
                modules.append(mod_data)
            else:
                modules.append({"id": mod_ref, "title": mod_ref, "labs": [], "chapters": [], "items": []})
        elif isinstance(mod_ref, dict):
            modules.append(mod_ref)
    if modules:
        data["modules"] = modules
    return data


def _content_hash(course_dir: Path) -> str:
    """Hash course.yaml + all module/lab YAMLs to detect content change."""
    h = hashlib.sha256()

    fp = course_dir / "course.yaml"
    if fp.exists():
        h.update(fp.read_bytes())

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


# ── S3 content source ─────────────────────────────────────────────────────────

def _s3_client():
    import boto3
    return boto3.client(
        "s3",
        region_name=AWS_REGION,
        endpoint_url=AWS_ENDPOINT_URL or None,
    )


def _seeded_content_version(db) -> str | None:
    """Version of the last content seeded from S3 (any course doc carries it)."""
    for doc in db.collection("courses").stream():
        version = doc.to_dict().get("contentVersion")
        if version:
            return version
    return None


class ContentNotPublished(Exception):
    """Raised when the bucket is reachable but nothing has been published yet."""


def _fetch_latest(db) -> dict | None:
    """Fetch latest.json from S3.

    Returns the parsed manifest, or None when S3 is unconfigured/unreachable.
    Raises ContentNotPublished when the bucket is reachable but has no content.
    """
    if not S3_BUCKET:
        return None
    try:
        client = _s3_client()
        resp = client.get_object(Bucket=S3_BUCKET, Key="latest.json")
        return json.loads(resp["Body"].read().decode("utf-8"))
    except client.exceptions.NoSuchKey:
        raise ContentNotPublished() from None
    except Exception:
        logger.warning("S3 content source unavailable", exc_info=True)
        return None


def download_content(s3_dir: Path, db) -> str | None:
    """Make the latest published content available on s3_dir.

    Returns the published version when S3 is the active source (downloading
    it first if the version changed), or None when S3 is unconfigured,
    unreachable, or has no published content yet — the caller treats that as
    a hard failure, never a fallback.

    Raises on integrity failures — a corrupt download must not seed silently.
    """
    try:
        latest = _fetch_latest(db)
    except ContentNotPublished:
        logger.info("No published content in bucket '%s' yet (latest.json not found)", S3_BUCKET)
        return None
    if latest is None:
        return None

    version = latest.get("version")
    if not version:
        raise ValueError("latest.json is missing 'version'")

    if version == _seeded_content_version(db) and (s3_dir / "index.json").exists():
        return version  # already current

    client = _s3_client()
    prefix = f"published/{version}/"

    tarball = client.get_object(Bucket=S3_BUCKET, Key=f"{prefix}content.tar.gz")["Body"].read()
    artifact_sha256 = hashlib.sha256(tarball).hexdigest()[:16]
    expected = latest.get("artifact_sha256")
    if expected and artifact_sha256 != expected:
        raise RuntimeError(f"Content tarball checksum mismatch for version {version}")

    manifest = json.loads(
        client.get_object(Bucket=S3_BUCKET, Key=f"{prefix}manifest.json")["Body"].read().decode("utf-8")
    )
    if manifest.get("version") != version:
        raise RuntimeError("manifest.json version does not match latest.json")
    files = manifest.get("files", [])

    # Extract to a temp sibling dir, verify every file, then atomically swap.
    tmp_dir = s3_dir.with_name(s3_dir.name + ".tmp")
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)
    try:
        with tarfile.open(fileobj=io.BytesIO(tarball), mode="r:*") as tar:
            tar.extractall(path=tmp_dir, filter="data")
        for entry in files:
            path = tmp_dir / entry["path"]
            if not path.is_file():
                raise RuntimeError(f"Extracted file missing: {entry['path']}")
            if hashlib.sha256(path.read_bytes()).hexdigest()[:16] != entry["sha256"]:
                raise RuntimeError(f"Extracted file checksum mismatch: {entry['path']}")
        if s3_dir.exists():
            shutil.rmtree(s3_dir)
        tmp_dir.rename(s3_dir)
    except Exception:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir)
        raise

    logger.info("Downloaded content version %s from S3", version)
    return version


def sync_courses(db: firestore.Client, content_dir: Path, content_version: str | None = None) -> dict:
    """
    Read index.json + course content, upsert to Firestore.
    Returns a summary dict with counts.
    """
    index_path = content_dir / "index.json"
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

        course_dir = content_dir / "courses" / cid
        course_data = _read_course_data(course_dir)
        if course_data is None:
            errors.append(f"courses/{cid}: course.yaml not found")
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

        for mi, mod in enumerate(course_data.get("modules", [])):
            chapters = []
            for ci, ch in enumerate(mod.get("chapters", [])):
                cid_val = ch["id"] if isinstance(ch, dict) else ch
                ctitle = ch.get("title", cid_val) if isinstance(ch, dict) else cid_val
                chapters.append({
                    "id": cid_val,
                    "title": ctitle,
                    "description": ch.get("description", "") if isinstance(ch, dict) else "",
                    "order": ch.get("order", ci + 1) if isinstance(ch, dict) else ci + 1,
                })
                total_chapters += 1

            labs = []
            for li, lab in enumerate(mod.get("labs", [])):
                if isinstance(lab, dict):
                    labs.append({
                        "id": lab["id"],
                        "title": lab.get("title", ""),
                        "description": lab.get("description", ""),
                        "chapterId": lab.get("chapterId", ""),
                        "order": lab.get("order", li + 1),
                    })
                else:
                    labs.append({
                        "id": lab,
                        "title": "",
                        "description": "",
                        "chapterId": "",
                        "order": li + 1,
                    })
                total_labs += 1

            modules.append({
                "id": mod.get("id", ""),
                "title": mod.get("title", ""),
                "description": mod.get("description", ""),
                "order": mod.get("order", mi + 1),
                "chapters": chapters,
                "labs": labs,
            })

        doc_data = {
            "id": cid,
            "title": course_data.get("title", entry.get("title", "")),
            "description": course_data.get("description", entry.get("description", "")),
            "slug": cid,
            "level": course_data.get("level", entry.get("level", "")),
            "modules": modules,
            "totalChapters": total_chapters,
            "totalLabs": total_labs,
            "contentHash": content_hash,
            "updatedAt": datetime.utcnow(),
        }

        if content_version is not None:
            doc_data["contentVersion"] = content_version

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
