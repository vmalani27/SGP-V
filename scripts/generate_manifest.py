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


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def build(content_dir: Path, out_dir: Path) -> str:
    # ── hash every file ───────────────────────────────────────
    entries = []
    for path in sorted(content_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(content_dir).as_posix()
        data = path.read_bytes()
        entries.append({"path": rel, "sha256": _sha256_bytes(data), "size": len(data)})

    # ── content-derived version ───────────────────────────────
    digest = hashlib.sha256()
    for entry in sorted(entries, key=lambda e: e["path"]):
        digest.update(f"{entry['path']} {entry['sha256']}\n".encode())
    version = digest.hexdigest()[:16]

    # ── deterministic tarball (relative paths, fixed metadata) ──
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
    # Hash the raw tar bytes, not the gzip stream: gzip output varies across
    # Python/zlib versions, while the tar (fixed mtime/uid/gid/mode) is
    # byte-deterministic — so artifact_sha256 is stable across machines.
    artifact_sha256 = _sha256_bytes(tar_bytes)

    # ── write outputs ─────────────────────────────────────────
    publish_dir = out_dir / "published" / version
    publish_dir.mkdir(parents=True, exist_ok=True)
    (publish_dir / "content.tar.gz").write_bytes(gzip.compress(tar_bytes, mtime=0))
    (publish_dir / "manifest.json").write_text(
        json.dumps({"version": version, "files": entries}, indent=2), encoding="utf-8"
    )
    (out_dir / "latest.json").write_text(
        json.dumps(
            {
                "version": version,
                "artifact_sha256": artifact_sha256,
                "published_at": datetime.now(timezone.utc).isoformat(),
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
