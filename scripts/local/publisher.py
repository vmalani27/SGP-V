#!/usr/bin/env python3
"""Local Content Publisher and Live Watcher for Floci S3.

Continuously detects file changes in the local content folder, validates the
content, generates publish manifests/artifacts, and synchronizes them to Floci.
"""

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

running = True


def _handle_signal(signum, frame):
    global running
    print("\n[publisher] Received termination signal. Shutting down gracefully...")
    running = False


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


def run_cmd(cmd, check=True, capture_output=False):
    res = subprocess.run(
        cmd,
        shell=isinstance(cmd, str),
        check=check,
        text=True,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.PIPE if capture_output else None,
    )
    return res


def wait_for_floci(endpoint_url: str, timeout: int = 120):
    print(f"[publisher] Waiting for Floci at {endpoint_url}...")
    start_time = time.time()
    while running and (time.time() - start_time < timeout):
        try:
            res = subprocess.run(
                ["aws", "s3api", "list-buckets", "--endpoint-url", endpoint_url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if res.returncode == 0:
                print(f"[publisher] Connected to Floci S3 at {endpoint_url}.")
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def ensure_bucket(endpoint_url: str, bucket: str):
    check_cmd = ["aws", "s3api", "head-bucket", "--bucket", bucket, "--endpoint-url", endpoint_url]
    res = subprocess.run(check_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if res.returncode != 0:
        print(f"[publisher] Bucket '{bucket}' not found. Creating bucket...")
        create_cmd = ["aws", "s3", "mb", f"s3://{bucket}", "--endpoint-url", endpoint_url]
        subprocess.run(create_cmd, check=True)
        print(f"[publisher] Created bucket 's3://{bucket}'.")
    else:
        print(f"[publisher] Bucket 's3://{bucket}' is ready.")


def compute_content_fingerprint(content_dir: Path) -> tuple:
    records = []
    if not content_dir.exists():
        return tuple(records)
    for p in sorted(content_dir.rglob("*")):
        if p.is_file():
            try:
                st = p.stat()
                records.append((str(p.relative_to(content_dir)), st.st_mtime_ns, st.st_size))
            except OSError:
                pass
    return tuple(records)


def publish(content_dir: Path, out_dir: Path, bucket: str, endpoint_url: str) -> str | None:
    print(f"[publisher] Validating content in {content_dir}...")
    val_res = subprocess.run(
        [sys.executable, "scripts/validate_content.py", str(content_dir)],
    )
    if val_res.returncode != 0:
        print(f"[publisher] [WARNING] Validation failed with code {val_res.returncode}. Skipping publish until issues are resolved.")
        return None

    print(f"[publisher] Generating content manifest and artifacts in {out_dir}...")
    gen_res = subprocess.run(
        [sys.executable, "scripts/generate_manifest.py", str(content_dir), str(out_dir)],
        capture_output=True,
        text=True,
    )
    if gen_res.returncode != 0:
        print(f"[publisher] [ERROR] Manifest generation failed:\n{gen_res.stderr}")
        return None

    version = gen_res.stdout.strip()
    print(f"[publisher] Content version generated: {version}")

    # Upload artifacts to Floci
    print(f"[publisher] Uploading artifacts to Floci (s3://{bucket})...")
    subprocess.run(
        [
            "aws", "s3", "cp",
            str(out_dir / "published"),
            f"s3://{bucket}/published/",
            "--recursive",
            "--cache-control", "public, max-age=31536000, immutable",
            "--endpoint-url", endpoint_url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    subprocess.run(
        [
            "aws", "s3", "cp",
            str(out_dir / "catalog.json"),
            f"s3://{bucket}/catalog.json",
            "--cache-control", "public, max-age=60",
            "--endpoint-url", endpoint_url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    subprocess.run(
        [
            "aws", "s3", "cp",
            str(out_dir / "latest.json"),
            f"s3://{bucket}/latest.json",
            "--cache-control", "public, max-age=60",
            "--endpoint-url", endpoint_url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )

    print(f"[publisher] Successfully published content version '{version}' to s3://{bucket}.")
    return version


def main():
    parser = argparse.ArgumentParser(description="Floci Content Publisher & Live Watcher")
    parser.add_argument("--once", action="store_true", help="Publish once and exit immediately")
    parser.add_argument("--interval", type=float, default=None, help="Poll interval in seconds")
    parser.add_argument("--content-dir", type=str, default=None, help="Path to content directory")
    parser.add_argument("--out-dir", type=str, default=None, help="Path to out directory")
    parser.add_argument("--bucket", type=str, default=None, help="Floci S3 bucket name")
    parser.add_argument("--endpoint", type=str, default=None, help="Floci endpoint URL")
    args = parser.parse_args()

    content_dir = Path(args.content_dir or os.environ.get("CONTENT_SRC_DIR", "content-v2")).resolve()
    out_dir = Path(args.out_dir or os.environ.get("OUT_DIR", "out")).resolve()
    bucket = args.bucket or os.environ.get("S3_BUCKET", "my-content-bucket")
    endpoint_url = args.endpoint or os.environ.get("AWS_ENDPOINT_URL", "http://floci:4566")
    poll_interval = args.interval or float(os.environ.get("PUBLISH_POLL_INTERVAL", "2"))

    watch_mode = not args.once and (os.environ.get("WATCH_MODE", "true").lower() in ("true", "1", "yes"))

    if not wait_for_floci(endpoint_url):
        print(f"[publisher] Timed out waiting for Floci at {endpoint_url}. Exiting.")
        return 1

    ensure_bucket(endpoint_url, bucket)

    # Initial publish
    last_fp = compute_content_fingerprint(content_dir)
    publish(content_dir, out_dir, bucket, endpoint_url)

    if not watch_mode:
        print("[publisher] Once mode: initial publish completed. Exiting.")
        return 0

    print(f"[publisher] Live change detection active. Watching {content_dir} every {poll_interval}s...")

    while running:
        time.sleep(poll_interval)
        if not running:
            break
        current_fp = compute_content_fingerprint(content_dir)
        if current_fp != last_fp:
            print("[publisher] Detected content modification in local folder!")
            time.sleep(0.5)  # Short debounce for multi-file writes
            current_fp = compute_content_fingerprint(content_dir)
            publish(content_dir, out_dir, bucket, endpoint_url)
            last_fp = current_fp

    return 0


if __name__ == "__main__":
    sys.exit(main())
