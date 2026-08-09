"""
Content Worker — validates content files and syncs course metadata to Firestore.

Runs as a long-lived service with a periodic background loop.
Exposes /health and /sync for external monitoring and manual triggers.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI

from app.config import CONTENT_DIR_S3, S3_BUCKET, SYNC_INTERVAL_SECONDS, get_firestore
from app.validator import validate_all
from app.seeder import download_content, sync_courses

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")

_content_dir_s3 = Path(CONTENT_DIR_S3)

# ── Shared state ──────────────────────────────────────────────

_state = {
    "last_run": None,
    "last_result": None,
    "running": False,
    "consecutive_errors": 0,
    "content_source": None,
    "published_version": None,
}


def _get_db():
    return get_firestore()


def _active_content_dir(db) -> tuple[Path, str, str]:
    """Resolve the S3 content source, downloading the latest published version.

    Returns (content_dir, version, artifact_sha256). The worker is S3-only —
    a missing or unreachable S3 source is a hard failure, never a fallback to
    a filesystem mount.
    """
    if not S3_BUCKET:
        raise RuntimeError("S3_BUCKET is not configured — worker requires an S3 content source")
    resolved = download_content(_content_dir_s3, db)
    if resolved is None:
        raise RuntimeError("S3 content source unavailable (unreachable or nothing published yet)")
    version, artifact_sha256 = resolved
    return _content_dir_s3, version, artifact_sha256


# ── Background loop ───────────────────────────────────────────

async def sync_loop():
    """Run validation + seeding on a fixed interval."""
    await asyncio.sleep(5)  # let services boot
    logger.info("Content sync loop started (interval=%ds)", SYNC_INTERVAL_SECONDS)

    while True:
        _state["running"] = True
        try:
            await asyncio.get_event_loop().run_in_executor(None, _run_sync)
            _state["consecutive_errors"] = 0
        except Exception:
            _state["consecutive_errors"] += 1
            logger.exception("Sync cycle failed")
        finally:
            _state["last_run"] = datetime.now(timezone.utc).isoformat()
            _state["running"] = False

        await asyncio.sleep(SYNC_INTERVAL_SECONDS)


def _run_sync():
    """Validate content, then seed to Firestore."""
    db = _get_db()
    content_dir, published_version, artifact_sha256 = _active_content_dir(db)
    _state["content_source"] = "s3"
    _state["published_version"] = published_version

    logger.info("Validating content in %s (source=%s, version=%s)", content_dir, _state["content_source"], published_version)

    result = validate_all(content_dir)

    for warning in result.warnings:
        logger.warning("Validation warning: %s", warning)

    if not result.ok:
        error_summary = "\n".join(str(e) for e in result.errors)
        logger.error("Content validation failed (%d errors):\n%s", len(result.errors), error_summary)
        _state["last_result"] = {
            "status": "validation_failed",
            "errors": [str(e) for e in result.errors],
            "warnings": [str(w) for w in result.warnings],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return

    logger.info("Content validation passed — seeding to Firestore")

    sync_result = sync_courses(
        db,
        content_dir=content_dir,
        content_version=published_version,
        artifact_sha256=artifact_sha256,
    )

    if sync_result["errors"]:
        logger.warning("Seed completed with warnings: %s", sync_result["errors"])

    _state["last_result"] = {
        "status": "ok",
        "synced": sync_result["synced"],
        "skipped": sync_result["skipped"],
        "errors": sync_result["errors"],
        "warnings": [str(w) for w in result.warnings],
        "content_source": _state["content_source"],
        "published_version": published_version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    logger.info(
        "Sync complete: %d synced, %d skipped, %d errors",
        sync_result["synced"],
        sync_result["skipped"],
        len(sync_result["errors"]),
    )


# ── App ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(sync_loop())
    yield
    task.cancel()


app = FastAPI(title="SGP Content Worker", lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "content_dir": str(_content_dir_s3),
        "content_source": "s3",
        "sync_interval_seconds": SYNC_INTERVAL_SECONDS,
    }


@app.get("/status")
def status():
    return {
        "last_run": _state["last_run"],
        "last_result": _state["last_result"],
        "running": _state["running"],
        "consecutive_errors": _state["consecutive_errors"],
        "content_source": _state["content_source"],
        "published_version": _state["published_version"],
    }


@app.post("/sync")
def trigger_sync():
    """Manually trigger a validation + sync cycle."""
    _run_sync()
    return {"status": "ok", "result": _state["last_result"]}
