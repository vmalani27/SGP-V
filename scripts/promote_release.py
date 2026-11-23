#!/usr/bin/env python3
"""Promote an approved Beta release to Production.

This script executes the immutable release promotion model:
1. Resolves the approved beta release manifest from the Beta S3 bucket.
2. Copies immutable content, tarballs, catalog, landing assets, and CLI downloads
   directly from Beta S3 to Prod S3 (ZERO REBUILDS).
3. Re-tags OCI container images in Amazon ECR Public using their exact verified digests.
4. Generates production release manifests pointing to the production CDN URL.
5. Invalidates the Production CloudFront CDN distribution cache.

Usage:
    python scripts/promote_release.py [options]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def run_cmd(cmd: list[str], check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    print(f"[promote] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=capture, text=True)
    if check and result.returncode != 0:
        print(f"[promote] Error running command: {result.stderr}", file=sys.stderr)
        sys.exit(result.returncode)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Promote Beta Release to Production")
    parser.add_argument("--beta-bucket", default=os.getenv("S3_BUCKET_BETA", ""), help="Source Beta S3 bucket")
    parser.add_argument("--prod-bucket", default=os.getenv("S3_BUCKET_PROD", os.getenv("S3_BUCKET", "")), help="Destination Prod S3 bucket")
    parser.add_argument("--beta-cdn-url", default=os.getenv("CDN_URL_BETA", ""), help="Source Beta CDN URL")
    parser.add_argument("--prod-cdn-url", default=os.getenv("CDN_URL_PROD", os.getenv("CDN_URL", "")), help="Destination Prod CDN URL")
    parser.add_argument("--registry", default=os.getenv("ECR_PUBLIC_REGISTRY", ""), help="ECR Public Registry")
    parser.add_argument("--prod-dist-id", default=os.getenv("CLOUDFRONT_DIST_ID_PROD", os.getenv("CLOUDFRONT_DIST_ID", "")), help="Prod CloudFront Distribution ID")
    parser.add_argument("--release-tag", default=os.getenv("BETA_RELEASE_TAG", ""), help="Specific beta tag (e.g. beta-30f0cf3)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without executing write operations")

    args = parser.parse_args()

    beta_bucket = args.beta_bucket
    prod_bucket = args.prod_bucket
    beta_cdn = args.beta_cdn_url.rstrip("/")
    prod_cdn = args.prod_cdn_url.rstrip("/")
    registry = args.registry.rstrip("/")
    prod_dist_id = args.prod_dist_id
    release_tag = args.release_tag
    dry_run = args.dry_run

    if not beta_bucket:
        print("[promote] Error: Beta S3 bucket not specified (--beta-bucket or S3_BUCKET_BETA)", file=sys.stderr)
        return 1
    if not prod_bucket:
        print("[promote] Error: Prod S3 bucket not specified (--prod-bucket or S3_BUCKET)", file=sys.stderr)
        return 1
    if not beta_cdn:
        print("[promote] Error: Beta CDN URL not specified (--beta-cdn-url or CDN_URL_BETA)", file=sys.stderr)
        return 1
    if not prod_cdn:
        print("[promote] Error: Prod CDN URL not specified (--prod-cdn-url or CDN_URL)", file=sys.stderr)
        return 1
    if not registry:
        print("[promote] Error: Registry not specified (--registry or ECR_PUBLIC_REGISTRY)", file=sys.stderr)
        return 1

    print("==================================================")
    print("LabOps Production Promotion Pipeline")
    print("==================================================")
    print(f"Beta S3 Bucket:  s3://{beta_bucket}")
    print(f"Prod S3 Bucket:  s3://{prod_bucket}")
    print(f"Beta CDN URL:    {beta_cdn}")
    print(f"Prod CDN URL:    {prod_cdn}")
    print(f"ECR Registry:    {registry}")
    print(f"Prod Dist ID:    {prod_dist_id}")
    print(f"Dry Run:         {dry_run}")
    print("==================================================\n")

    # ── 1. RESOLVE BETA RELEASE MANIFEST ──────────────────────────────
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        beta_manifest_file = tmp_path / "beta_manifest.json"

        if release_tag:
            manifest_s3_path = f"s3://{beta_bucket}/releases/{release_tag}/release.json"
        else:
            manifest_s3_path = f"s3://{beta_bucket}/releases/beta.json"

        print(f"[promote] Fetching beta release manifest from {manifest_s3_path}...")
        res = run_cmd(["aws", "s3", "cp", manifest_s3_path, str(beta_manifest_file)], check=False)
        if res.returncode != 0:
            print(f"[promote] FAILED: Could not locate beta manifest at {manifest_s3_path}", file=sys.stderr)
            return 1

        manifest = json.loads(beta_manifest_file.read_text(encoding="utf-8"))
        active_version = manifest.get("version", "")
        content_info = manifest.get("content", {})
        content_version = content_info.get("version", "")
        images = manifest.get("images", {})

        print(f"[promote] Target Beta Release Tag: {active_version}")
        print(f"[promote] Curriculum Content Version: {content_version}")
        print(f"[promote] Content SHA256: {content_info.get('artifact_sha256', '')}")
        print(f"[promote] Number of Container Images: {len(images)}")

        if not content_version:
            print("[promote] ERROR: Manifest missing content.version", file=sys.stderr)
            return 1

        # ── 2. COPY S3 ARTIFACTS FROM BETA TO PROD (NO REBUILDS) ─────────
        print("\n[promote] ── Step 2: Copying S3 Artifacts from Beta to Prod ──")
        s3_copies = [
            # Immutable content package
            (f"s3://{beta_bucket}/published/{content_version}/", f"s3://{prod_bucket}/published/{content_version}/", True, "public, max-age=31536000, immutable"),
            # Root pointers
            (f"s3://{beta_bucket}/catalog.json", f"s3://{prod_bucket}/catalog.json", False, "public, max-age=60, s-maxage=60"),
            (f"s3://{beta_bucket}/latest.json", f"s3://{prod_bucket}/latest.json", False, "public, max-age=60, s-maxage=60"),
            # Landing page
            (f"s3://{beta_bucket}/index.html", f"s3://{prod_bucket}/index.html", False, "public, max-age=300"),
            (f"s3://{beta_bucket}/assets/", f"s3://{prod_bucket}/assets/", True, "public, max-age=86400"),
            # CLI Binaries
            (f"s3://{beta_bucket}/downloads/", f"s3://{prod_bucket}/downloads/", True, "public, max-age=300"),
        ]

        for src, dst, is_recursive, cache_ctl in s3_copies:
            cmd = ["aws", "s3", "cp", src, dst, "--cache-control", cache_ctl]
            if is_recursive:
                cmd.append("--recursive")
            if dry_run:
                print(f"[dry-run] Would execute: {' '.join(cmd)}")
            else:
                run_cmd(cmd)

        # ── 3. GENERATE & PUBLISH PRODUCTION RELEASE MANIFESTS ──────────
        print("\n[promote] ── Step 3: Generating Production Release Manifests ──")
        prod_images = {}
        for svc_name, svc_meta in images.items():
            digest = svc_meta.get("digest", "")
            alias = svc_meta.get("alias", "")
            repo_name = f"labops-{svc_name}" if not svc_name.startswith("labops-") else svc_name
            prod_svc_entry = {
                "remote": f"{registry}/{repo_name}:prod",
                "digest": digest,
            }
            if alias:
                prod_svc_entry["alias"] = alias
            prod_images[svc_name] = prod_svc_entry

        prod_manifest = {
            "version": active_version,
            "channel": "prod",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "content": {
                "version": content_version,
                "artifact_sha256": content_info.get("artifact_sha256", ""),
                "archive_url": f"{prod_cdn}/published/{content_version}/content.tar.gz",
                "catalog_url": f"{prod_cdn}/published/{content_version}/catalog.json",
            },
            "images": prod_images,
        }

        prod_manifest_bytes = json.dumps(prod_manifest, indent=2).encode("utf-8")
        prod_manifest_local = tmp_path / "prod.json"
        prod_manifest_local.write_bytes(prod_manifest_bytes)

        # Write to s3://prod/releases/{active_version}/release.json, releases/prod.json, releases/stable.json
        manifest_destinations = [
            f"s3://{prod_bucket}/releases/{active_version}/release.json",
            f"s3://{prod_bucket}/releases/prod.json",
            f"s3://{prod_bucket}/releases/stable.json",
        ]
        for dest in manifest_destinations:
            cmd = ["aws", "s3", "cp", str(prod_manifest_local), dest, "--cache-control", "public, max-age=60, s-maxage=60"]
            if dry_run:
                print(f"[dry-run] Would execute: {' '.join(cmd)}")
            else:
                run_cmd(cmd)

        # ── 4. RE-TAG OCI IMAGES IN ECR PUBLIC VIA MANIFEST (NO REBUILDS) ─
        print("\n[promote] ── Step 4: Re-tagging OCI Images in Amazon ECR Public ──")
        for svc_name, svc_meta in images.items():
            digest = svc_meta.get("digest", "")
            if not digest or not digest.startswith("sha256:"):
                print(f"[promote] Skipping image {svc_name}: no sha256 digest found ({digest})")
                continue

            repo_name = f"labops-{svc_name}" if not svc_name.startswith("labops-") else svc_name
            print(f"[promote] Tagging {repo_name} ({digest[:19]}...) -> prod, latest, {active_version}")

            if dry_run:
                print(f"[dry-run] Would fetch manifest for {repo_name}@{digest} and put-image as :prod, :latest, :{active_version}")
                continue

            # Fetch image manifest using digest
            manifest_res = run_cmd([
                "aws", "ecr-public", "batch-get-image",
                "--repository-name", repo_name,
                "--image-ids", f"imageDigest={digest}",
                "--query", "images[0].imageManifest",
                "--output", "text",
                "--region", "us-east-1"
            ], check=False)

            if manifest_res.returncode != 0 or not manifest_res.stdout.strip() or manifest_res.stdout.strip() == "None":
                print(f"[promote] WARNING: Could not fetch manifest for {repo_name}@{digest}. Continuing.", file=sys.stderr)
                continue

            raw_manifest = manifest_res.stdout.strip()
            manifest_file = tmp_path / f"manifest_{svc_name}.json"
            manifest_file.write_text(raw_manifest, encoding="utf-8")

            # Tag as :prod and :latest
            for tag in ["prod", "latest", active_version]:
                put_res = run_cmd([
                    "aws", "ecr-public", "put-image",
                    "--repository-name", repo_name,
                    "--image-manifest", raw_manifest,
                    "--image-tag", tag,
                    "--region", "us-east-1"
                ], check=False)
                if put_res.returncode == 0:
                    print(f"   ✓ {repo_name}:{tag}")
                else:
                    print(f"   ⚠ {repo_name}:{tag} tag update returned non-zero (may already be set)", file=sys.stderr)

        # ── 5. INVALIDATE PRODUCTION CLOUDFRONT DISTRIBUTION ──────────────
        print("\n[promote] ── Step 5: Invalidating Production CloudFront CDN Cache ──")
        if prod_dist_id:
            cmd = [
                "aws", "cloudfront", "create-invalidation",
                "--distribution-id", prod_dist_id,
                "--paths", "/releases/*", "/latest.json", "/catalog.json", "/", "/index.html", "/assets/*", "/downloads/*"
            ]
            if dry_run:
                print(f"[dry-run] Would execute: {' '.join(cmd)}")
            else:
                run_cmd(cmd)

    print("\n==================================================")
    print("SUCCESS: Production release promotion complete!")
    print(f"Active Release: {active_version}")
    print(f"Production CDN: {prod_cdn}")
    print("==================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
