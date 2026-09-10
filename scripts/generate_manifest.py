#!/usr/bin/env python3
"""Build the content publish artifact.

Walks a content directory, hashes every file, and produces:

    out/latest.json                       version pointer (bucket root)
    out/published/{version}/manifest.json per-file sha256 list
    out/published/{version}/content.tar.gz deterministic tarball

The version is content-derived (sha256 over sorted "path sha256" lines), so
identical content always produces the identical version — re-publishing an
unchanged tree is a no-op. The tarball is deterministic (fixed mtime/uid/gid)
and artifact_sha256 hashes the raw (uncompressed) tar bytes, so identical
content also produces an identical artifact_sha256 regardless of the
Python/zlib version that built it.

Usage:
    python scripts/generate_manifest.py <content-dir> <out-dir>

Prints the version to stdout.
"""

import gzip
import hashlib
import io
import json
import os
import tarfile
import sys
from datetime import datetime, timezone
from pathlib import Path
import yaml


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def _read_yaml(path: Path) -> dict | None:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _title_from_md(md_path: Path) -> str | None:
    try:
        for line in md_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                return line[2:].strip()
    except Exception:
        pass
    return None


def build_catalog(content_dir: Path, version: str) -> dict:
    courses = []
    courses_dir = content_dir / "courses"
    if not courses_dir.exists():
        return {"version": version, "courses": []}

    for course_folder in sorted(courses_dir.iterdir()):
        if not course_folder.is_dir():
            continue
        course_yaml = course_folder / "course.yaml"
        if not course_yaml.exists():
            continue
        cdata = _read_yaml(course_yaml) or {}
        course_id = cdata.get("id", course_folder.name)

        modules = []
        total_chapters = 0
        total_labs = 0

        for mi, mod_ref in enumerate(cdata.get("modules", [])):
            mod_id = mod_ref if isinstance(mod_ref, str) else mod_ref.get("id", f"module-{mi+1}")
            mod_yaml = course_folder / "modules" / mod_id / "module.yaml"
            mod_data = _read_yaml(mod_yaml) if mod_yaml.exists() else {}
            mod_data = mod_data or {}

            raw_items = mod_data.get("items", [])
            items = []
            chapters = []
            labs = []

            chapters_dir = course_folder / "modules" / mod_id / "chapters"
            labs_dir = course_folder / "modules" / mod_id / "labs"

            for item_ref in raw_items:
                if isinstance(item_ref, str):
                    itype = "lab" if item_ref.startswith("lab-") else "chapter"
                    iid = item_ref
                elif isinstance(item_ref, dict):
                    itype = item_ref.get("type", "chapter")
                    iid = item_ref.get("id", "")
                else:
                    continue

                if itype == "chapter":
                    title = _title_from_md(chapters_dir / f"{iid}.md") or iid
                    ch_obj = {"id": iid, "title": title, "order": len(chapters) + 1}
                    chapters.append(ch_obj)
                    items.append({"type": "chapter", "id": iid, "title": title})
                    total_chapters += 1
                elif itype == "lab":
                    lab_data = _read_yaml(labs_dir / iid / "lab.yaml") or {}
                    title = lab_data.get("title") or _title_from_md(labs_dir / iid / "instructions.md") or iid
                    lab_obj = {
                        "id": iid,
                        "title": title,
                        "description": lab_data.get("description", ""),
                        "order": len(labs) + 1,
                    }
                    labs.append(lab_obj)
                    items.append({"type": "lab", "id": iid, "title": title})
                    total_labs += 1

            modules.append({
                "id": mod_id,
                "title": mod_data.get("title", mod_id),
                "description": mod_data.get("description", ""),
                "order": mod_data.get("order", mi + 1),
                "items": items,
                "chapters": chapters,
                "labs": labs,
            })

        courses.append({
            "id": course_id,
            "title": cdata.get("title", course_id),
            "description": cdata.get("description", ""),
            "level": cdata.get("level", "beginner"),
            "prerequisites": cdata.get("prerequisites", []),
            "environment": cdata.get("environment", []),
            "keyTakeaways": cdata.get("keyTakeaways", []),
            "quickLinks": cdata.get("quickLinks", []),
            "totalChapters": total_chapters,
            "totalLabs": total_labs,
            "modules": modules,
        })

    return {"version": version, "courses": courses}


def compute_changes(old_manifest_path: Path, new_entries: list[dict]) -> tuple[str | None, list[dict]]:
    if not old_manifest_path.exists():
        return None, []
    try:
        old_data = json.loads(old_manifest_path.read_text(encoding="utf-8"))
        old_version = old_data.get("version")
        old_map = {e["path"]: e["sha256"] for e in old_data.get("files", [])}
    except Exception:
        return None, []

    new_map = {e["path"]: e["sha256"] for e in new_entries}
    changes = []

    for path, sha in new_map.items():
        if path not in old_map:
            changes.append({"path": path, "change": "new"})
        elif old_map[path] != sha:
            changes.append({"path": path, "change": "modified"})

    for path in old_map:
        if path not in new_map:
            changes.append({"path": path, "change": "removed"})

    return old_version, changes


def build(content_dir: Path, out_dir: Path) -> str:
    # ── 1. Hash every file ────────────────────────────────────
    entries = []
    for path in sorted(content_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(content_dir).as_posix()
        data = path.read_bytes()
        entries.append({"path": rel, "sha256": _sha256_bytes(data), "size": len(data)})

    # ── 2. Content-derived version ────────────────────────────
    digest = hashlib.sha256()
    for entry in sorted(entries, key=lambda e: e["path"]):
        digest.update(f"{entry['path']} {entry['sha256']}\n".encode())
    version = digest.hexdigest()[:16]

    # ── 3. Check for previous version diffs ───────────────────
    previous_manifest = None
    latest_path = out_dir / "latest.json"
    if latest_path.exists():
        try:
            prev_latest = json.loads(latest_path.read_text(encoding="utf-8"))
            prev_v = prev_latest.get("version")
            if prev_v and prev_v != version:
                previous_manifest = out_dir / "published" / prev_v / "manifest.json"
        except Exception:
            pass

    from_version, changes = (None, [])
    if previous_manifest and previous_manifest.exists():
        from_version, changes = compute_changes(previous_manifest, entries)

    # ── 4. Deterministic tarball ──────────────────────────────
    tar_buf = io.BytesIO()
    with tarfile.open(fileobj=tar_buf, mode="w") as tar:
        for entry in sorted(entries, key=lambda e: e["path"]):
            info = tarfile.TarInfo(name=entry["path"])
            info.size = entry["size"]
            info.mtime = 0
            info.uid = 0
            info.gid = 0
            info.mode = 0o644
            data = (content_dir / entry["path"]).read_bytes()
            tar.addfile(info, io.BytesIO(data))
    tar_bytes = tar_buf.getvalue()
    artifact_sha256 = _sha256_bytes(tar_bytes)

    # ── 5. Build full catalog metadata ────────────────────────
    catalog_data = build_catalog(content_dir, version)

    # ── 6. Write outputs ──────────────────────────────────────
    publish_dir = out_dir / "published" / version
    publish_dir.mkdir(parents=True, exist_ok=True)
    (publish_dir / "content.tar.gz").write_bytes(gzip.compress(tar_bytes, mtime=0))
    (publish_dir / "manifest.json").write_text(
        json.dumps({"version": version, "files": entries}, indent=2), encoding="utf-8"
    )
    (publish_dir / "catalog.json").write_text(
        json.dumps(catalog_data, indent=2), encoding="utf-8"
    )
    (publish_dir / "changes.json").write_text(
        json.dumps(
            {
                "version": version,
                "from_version": from_version,
                "changes": changes,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Root pointers
    (out_dir / "catalog.json").write_text(
        json.dumps(catalog_data, indent=2), encoding="utf-8"
    )
    (out_dir / "latest.json").write_text(
        json.dumps(
            {
                "version": version,
                "artifact_sha256": artifact_sha256,
                "published_at": datetime.now(timezone.utc).isoformat(),
                "from_version": from_version,
                "changes": changes,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return version


def main() -> int:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <content-dir> <out-dir>", file=sys.stderr)
        return 2
    version = build(Path(sys.argv[1]), Path(sys.argv[2]))
    print(version)
    return 0


if __name__ == "__main__":
    sys.exit(main())

