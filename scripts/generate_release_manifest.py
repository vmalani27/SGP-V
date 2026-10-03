#!/usr/bin/env python3
"""Generate Unified Release Manifest for LabOps.

Creates a unified release.json file linking exact content tarball SHA256, catalog URLs,
and immutable Docker image tags / sha256 digests.

Outputs:
    out/releases/{tag}/release.json
    out/releases/{channel}.json

Usage:
    python scripts/generate_release_manifest.py <tag> <channel> <out-dir> [images-json-path]
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


import os


def generate_release_manifest(
    tag: str, channel: str, out_dir: Path, images_json_path: Path | None = None, cdn_url: str = ""
) -> dict:
    out_dir = Path(out_dir)
    cdn_url = (cdn_url or os.getenv("CDN_URL", "")).rstrip("/")

    # 1. Read latest content version metadata
    latest_json_path = out_dir / "latest.json"
    content_meta = {}
    if latest_json_path.exists():
        try:
            content_meta = json.loads(latest_json_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"Warning: Could not parse {latest_json_path}: {e}", file=sys.stderr)

    content_version = content_meta.get("version", "")
    artifact_sha256 = content_meta.get("artifact_sha256", "")

    # 2. Read images metadata map
    images_meta = {}
    if images_json_path and Path(images_json_path).exists():
        try:
            images_meta = json.loads(Path(images_json_path).read_text(encoding="utf-8"))
        except Exception as e:
            print(f"Warning: Could not parse {images_json_path}: {e}", file=sys.stderr)
    else:
        # Default image structure if no images.json provided
        registry_base = os.getenv("ECR_PUBLIC_REGISTRY", "")
        images_meta = {
            "frontend": {
                "remote": f"{registry_base}/labops-frontend:{tag}",
                "digest": "",
            },
            "orchestrator": {
                "remote": f"{registry_base}/labops-orchestrator:{tag}",
                "digest": "",
            },
            "content-sync": {
                "remote": f"{registry_base}/labops-content-sync:{tag}",
                "digest": "",
            },
            "proxy": {
                "remote": f"{registry_base}/labops-proxy:{tag}",
                "digest": "",
            },
            "git-server": {
                "remote": f"{registry_base}/labops-git-server:latest",
                "digest": "",
            },
            "labops-ubuntu": {
                "remote": f"{registry_base}/labops-ubuntu:{tag}",
                "digest": "",
                "alias": "labops-ubuntu:latest",
            },
            "labops-docker": {
                "remote": f"{registry_base}/labops-docker:{tag}",
                "digest": "",
                "alias": "labops-docker:latest",
            },
            "labops-docker-fundamentals": {
                "remote": f"{registry_base}/labops-docker-fundamentals:{tag}",
                "digest": "",
                "alias": "labops-docker-fundamentals:latest",
            },
            "labops-docker-build": {
                "remote": f"{registry_base}/labops-docker-build:{tag}",
                "digest": "",
                "alias": "labops-docker-build:latest",
            },
            "labops-git-fundamentals": {
                "remote": f"{registry_base}/labops-git-fundamentals:{tag}",
                "digest": "",
                "alias": "labops-git-fundamentals:latest",
            },
        }

    manifest = {
        "version": tag,
        "channel": channel,
        "published_at": datetime.now(timezone.utc).isoformat(),
        "content": {
            "version": content_version,
            "artifact_sha256": artifact_sha256,
            "archive_url": f"{cdn_url}/published/{content_version}/content.tar.gz" if content_version else "",
            "catalog_url": f"{cdn_url}/published/{content_version}/catalog.json" if content_version else f"{cdn_url}/catalog.json",
        },
        "images": images_meta,
    }

    # 3. Write output files
    release_dir = out_dir / "releases" / tag
    release_dir.mkdir(parents=True, exist_ok=True)
    
    (release_dir / "release.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    channel_dir = out_dir / "releases"
    channel_dir.mkdir(parents=True, exist_ok=True)
    (channel_dir / f"{channel}.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate LabOps Release Manifest")
    parser.add_argument("tag", help="Release tag version (e.g. v0.4.0)")
    parser.add_argument("channel", help="Release channel (e.g. stable, beta, dev)")
    parser.add_argument("out_dir", help="Output directory (e.g. out/)")
    parser.add_argument("images_json", nargs="?", default=None, help="Path to images metadata JSON file")
    parser.add_argument("--cdn-url", default=os.getenv("CDN_URL", ""), help="Public CDN URL")

    args = parser.parse_args()

    manifest = generate_release_manifest(
        tag=args.tag,
        channel=args.channel,
        out_dir=Path(args.out_dir),
        images_json_path=Path(args.images_json) if args.images_json else None,
        cdn_url=args.cdn_url,
    )

    print(f"Generated Release Manifest for {manifest['version']} ({manifest['channel']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
