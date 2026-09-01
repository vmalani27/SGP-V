"""
Firestore seeder — syncs validated v2 content to the courses collection.
Idempotent: only writes when data has changed.

Synced document shape (Firestore courses collection):
{
  "id": "git-fundamentals",
  "title": "Git Fundamentals",
  "description": "...",
  "level": "beginner",
  "modules": [
    {
      "id": "git-basics",
      "title": "Git Basics",
      "description": "...",
      "order": 1,
      "items": [
        { "type": "chapter", "id": "chapter-1", "title": "...", "order": 1 },
        { "type": "lab", "id": "lab-1", "title": "...", "chapterId": "chapter-1", "order": 2 }
      ],
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
  "contentVersion": "abc123...",
  "artifact_sha256": "abcd1234...",
  "updatedAt": <timestamp>,
  "createdAt": <timestamp>
}

Field contract:
  - Source (authored):      title, description, level, modules[].{id,title,description,order}, items[]
  - Derived (by this file): modules[].chapters, modules[].labs, modules[].items (with titles),
                            totalChapters, totalLabs, contentHash
  - Programmatic:           id (= doc id), contentVersion, updatedAt, createdAt

slug and estimatedHours are intentionally absent — id already is the slug, and
estimatedHours was stale data with no source in content-v2/.
"""

from __future__ import annotations

import io
import json
import hashlib
import logging
import shutil
import tarfile
import gzip
from datetime import datetime
from pathlib import Path

import yaml

from firebase_admin import firestore

# from app.config import AWS_ENDPOINT_URL, AWS_REGION, S3_BUCKET

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


def _build_modules(course_data: dict) -> tuple[list[dict], int, int]:
    """Derive the Firestore module structure + totals from parsed course data.

    Returns (modules, total_chapters, total_labs). Every field here is
    *derived* — recomputed from the source content on every sync so it can
    never go stale the way a one-shot seed can.
    """
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

        # The linear learning path (canonical ordering, with titles resolved).
        items = []
        for item in mod.get("items", []):
            if not isinstance(item, dict):
                continue
            items.append({
                "type": item.get("type", "chapter"),
                "id": item.get("id", ""),
                "title": item.get("title", "") or item.get("id", ""),
            })

        modules.append({
            "id": mod.get("id", ""),
            "title": mod.get("title", ""),
            "description": mod.get("description", ""),
            "order": mod.get("order", mi + 1),
            "items": items,
            "chapters": chapters,
            "labs": labs,
        })

    return modules, total_chapters, total_labs


def _doc_key(doc: dict) -> tuple:
    """Return a comparable key for a courses doc, excluding timestamps.

    createdAt/updatedAt are programmatic bookkeeping — they are not part of
    the content contract and must not drive a rewrite.
    """
    return tuple(sorted(
        (k, json.dumps(v, sort_keys=True, default=str))
        for k, v in doc.items()
        if k not in ("createdAt", "updatedAt")
    ))


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


def _fetch_manifest(client, version: str) -> dict | None:
    """Fetch published/{version}/manifest.json from S3, or None on failure.

    Used to compute the diff against the previously published version. The
    manifest is never inside the content tarball, so it must be fetched.
    """
    key = f"published/{version}/manifest.json"
    try:
        resp = client.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(resp["Body"].read().decode("utf-8"))
    except client.exceptions.NoSuchKey:
        logger.info("No manifest for previous version %s", version)
        return None
    except Exception:
        logger.warning("Failed to fetch previous manifest %s", key, exc_info=True)
        return None


def _diff_manifests(from_version: str, to_version: str, old_files, new_files) -> dict:
    """Compare two manifests' file lists, producing per-path change records.

    Per-path classification:
      - "new":      present in the new version only
      - "removed":  present in the old version only
      - "modified": present in both but content (sha256) differs

    The version is content-derived (sha256 over "path sha256" lines), so any
    file change always yields a new version, and the diff tells the UI which
    chapters/labs were touched.
    """
    old = {
        f["path"]: f["sha256"]
        for f in (old_files or [])
        if isinstance(f, dict) and f.get("path")
    }
    new = {
        f["path"]: f["sha256"]
        for f in (new_files or [])
        if isinstance(f, dict) and f.get("path")
    }

    changes = []
    for path in sorted(set(old) | set(new)):
        if path not in old:
            changes.append({"path": path, "change": "new"})
        elif path not in new:
            changes.append({"path": path, "change": "removed"})
        elif old[path] != new[path]:
            changes.append({"path": path, "change": "modified"})

    return {
        "version": to_version,
        "from_version": from_version,
        "changes": changes,
        "updatedAt": datetime.utcnow(),
    }


def _content_changes_key(doc: dict) -> tuple:
    """Comparable key for a content_changes doc, excluding the timestamp."""
    return tuple(sorted(
        (k, json.dumps(v, sort_keys=True, default=str))
        for k, v in doc.items()
        if k != "updatedAt"
    ))


def _store_content_changes(db, diff: dict) -> None:
    """Idempotent upsert of a version's diff into the content_changes collection.

    Doc id = target version. The backend reads it back in /content/version so
    the client can badge chapters/labs as new or updated.
    """
    ref = db.collection("content_changes").document(diff["version"])
    existing = ref.get()
    if existing.exists and _content_changes_key(existing.to_dict()) == _content_changes_key(diff):
        return
    ref.set(diff)
    logger.info("Stored content changes for version %s (%d changed files)",
                diff["version"], len(diff["changes"]))


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


def _clear_dir(path: Path) -> None:
    """Remove a directory's contents. s3_dir may be a mount point, which
    rmtree cannot delete — remove children instead."""
    for child in path.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()


_VERIFIED_SHA_MARKER = ".verified-artifact-sha256"


def _read_verified_sha(s3_dir: Path) -> str:
    """Artifact sha256 that was actually downloaded and verified, or ''."""
    try:
        return (s3_dir / _VERIFIED_SHA_MARKER).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def download_content(s3_dir: Path, db) -> tuple[str, str] | None:
    """Make the latest published content available on s3_dir.

    Returns (version, artifact_sha256) when S3 is the active source
    (downloading it first if the version changed or latest.json's
    artifact_sha256 no longer matches the last verified download), or None
    when S3 is unconfigured, unreachable, or has no published content yet —
    the caller treats that as a hard failure, never a fallback.

    Raises on integrity failures — a corrupt download must not seed silently,
    and an unverified hash must never be returned to the caller.
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

    expected_sha = latest.get("artifact_sha256", "")

    # A version match alone is not enough to skip the download: latest.json can
    # be rewritten under an unchanged version (republish drift, hash-convention
    # change), so only skip when its artifact hash matches what we verified.
    if (
        version == _seeded_content_version(db)
        and (s3_dir / "index.json").exists()
        and (not expected_sha or expected_sha == _read_verified_sha(s3_dir))
    ):
        return version, expected_sha  # already current + still verified

    client = _s3_client()
    prefix = f"published/{version}/"

    tarball = client.get_object(Bucket=S3_BUCKET, Key=f"{prefix}content.tar.gz")["Body"].read()
    # artifact_sha256 covers the raw (uncompressed) tar bytes — the gzip stream
    # is not byte-stable across Python/zlib versions, the tar is.
    artifact_sha256 = hashlib.sha256(gzip.decompress(tarball)).hexdigest()[:16]
    expected = latest.get("artifact_sha256")
    if expected and artifact_sha256 != expected:
        raise RuntimeError(f"Content tarball checksum mismatch for version {version}")

    manifest = json.loads(
        client.get_object(Bucket=S3_BUCKET, Key=f"{prefix}manifest.json")["Body"].read().decode("utf-8")
    )
    if manifest.get("version") != version:
        raise RuntimeError("manifest.json version does not match latest.json")
    files = manifest.get("files", [])

    # Publish a per-version changelog so the client can badge chapters/labs as
    # new/updated. Only meaningful once there is a previously seeded version —
    # a first publish must not flag everything as new.
    previous_version = _seeded_content_version(db)
    if previous_version and previous_version != version:
        prev_manifest = _fetch_manifest(client, previous_version)
        if prev_manifest:
            diff = _diff_manifests(
                previous_version, version, prev_manifest.get("files"), files
            )
            _store_content_changes(db, diff)
    elif previous_version == version:
        logger.info("Content version unchanged (%s) — skipping changelog", version)
    else:
        logger.info("First published content (no previous version) — no changelog")

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

        # Swap the extracted tree into s3_dir. s3_dir is typically a volume
        # mount point, so neither rmtree nor rename can operate on it
        # directly — move the verified contents in instead.
        s3_dir.mkdir(parents=True, exist_ok=True)
        for child in tmp_dir.iterdir():
            target = s3_dir / child.name
            if target.exists():
                if target.is_dir() and not target.is_symlink():
                    shutil.rmtree(target)
                else:
                    target.unlink()
            shutil.move(str(child), str(target))
    except Exception:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir)
        raise

    logger.info("Downloaded content version %s from S3", version)
    (s3_dir / _VERIFIED_SHA_MARKER).write_text(artifact_sha256, encoding="utf-8")
    return version, artifact_sha256


def sync_courses(
    db: firestore.Client,
    content_dir: Path,
    content_version: str | None = None,
    artifact_sha256: str | None = None,
) -> dict:
    """
    Read index.json + course content, upsert to Firestore.

    Full reconciliation: every cycle rebuilds the derived document from source
    content and rewrites Firestore whenever the stored document differs from
    what would be produced now. contentHash is kept in the document for
    introspection, but it never gates a write by itself — a stale derived
    field (e.g. a module seeded with empty chapters) can never persist.
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

        modules, total_chapters, total_labs = _build_modules(course_data)

        doc_data = {
            "id": cid,
            "title": course_data.get("title", entry.get("title", "")),
            "description": course_data.get("description", entry.get("description", "")),
            "level": course_data.get("level", entry.get("level", "")),
            "modules": modules,
            "totalChapters": total_chapters,
            "totalLabs": total_labs,
            "contentHash": _content_hash(course_dir),
            "updatedAt": datetime.utcnow(),
        }

        # Optional course enrichment for the curriculum sidebar. Only copies
        # keys that are actually present in source, so documents authored
        # without them stay unchanged.
        for field in ("prerequisites", "environment", "keyTakeaways", "quickLinks"):
            if course_data.get(field) is not None:
                doc_data[field] = course_data[field]

        if content_version is not None:
            doc_data["contentVersion"] = content_version

        if artifact_sha256 is not None:
            doc_data["artifact_sha256"] = artifact_sha256

        existing_doc = existing.get(cid)
        if existing_doc:
            created_at = existing_doc.get("createdAt")
            if created_at is not None:
                doc_data["createdAt"] = created_at

        if existing_doc and _doc_key(existing_doc) == _doc_key(doc_data):
            skipped += 1
            continue

        if not existing_doc or "createdAt" not in doc_data:
            doc_data["createdAt"] = datetime.utcnow()

        courses_ref.document(cid).set(doc_data)
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
