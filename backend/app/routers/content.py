"""
Content API — metadata + delivery handshake only.

The backend no longer serves course files. Course catalog + TOC metadata is
served from Firestore (see courses.py), and the content payload itself is
downloaded by the client from S3. This router exposes the version handshake
the client uses to bootstrap and integrity-check its local content store.
"""

import urllib.parse

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException

from app.config import CONTENT_PUBLIC_BASE_URL
from app.core.firestore_db import db

router = APIRouter(prefix="/api/v1/content", tags=["content"])


def get_presigned_download_url(base_url: str, version: str) -> str:
    """Generate a presigned S3 URL for content.tar.gz.

    Parses the bucket name and region from virtual-hosted style S3 URLs,
    e.g., https://bucket-name.s3.region-name.amazonaws.com.
    """
    try:
        parsed = urllib.parse.urlparse(base_url)
        hostname = parsed.hostname or ""
        parts = hostname.split(".")
        if not parts:
            return f"{base_url}/published/{version}/content.tar.gz"

        bucket = parts[0]
        region = "ap-south-1"  # fallback default
        if len(parts) > 2 and parts[1] == "s3" and parts[2] != "amazonaws":
            region = parts[2]

        # Sign against the regional endpoint (not the global s3.amazonaws.com).
        # S3 returns a 307 TemporaryRedirect for region-specific buckets signed
        # against the global endpoint, which breaks the signature on redirect.
        endpoint_url = f"https://s3.{region}.amazonaws.com"
        s3_client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )

        key = f"published/{version}/content.tar.gz"
        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,  # 1 hour expiration
        )
        return presigned_url
    except Exception:
        # Fallback to the static public URL if boto3 credentials are not configured
        return f"{base_url}/published/{version}/content.tar.gz"


def _serialize_timestamp(value) -> str | None:
    """Firestore stores datetimes as timestamps; hand them back as ISO-8601."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except (TypeError, ValueError):
            return None
    return None


@router.get("/version")
async def content_version() -> dict:
    """Return the published content version + S3 download pointer.

    Reads contentVersion/artifact_sha256 from any Firestore course document
    (the worker writes them on every sync). download_url is derived from the
    configured public base URL, which the client fetches directly.

    Also returns the worker-computed changelog for the current version
    (content_changes/{version}) so the client can badge chapters/labs as
    newly added or updated.
    """
    for doc in db.collection("courses").stream():
        data = doc.to_dict()
        version = data.get("contentVersion")
        if not CONTENT_PUBLIC_BASE_URL:
            raise HTTPException(
                status_code=500,
                detail="CONTENT_PUBLIC_BASE_URL is not configured; cannot build the content download URL",
            )
        if version:
            changes: list[dict] = []
            from_version: str | None = None
            updated_at: str | None = None
            changes_doc = db.collection("content_changes").document(version).get()
            if changes_doc.exists:
                changes_data = changes_doc.to_dict()
                # Guard against a stale changelog racing ahead of the course
                # metadata update in the same worker cycle.
                if changes_data.get("version") == version:
                    changes = changes_data.get("changes", [])
                    from_version = changes_data.get("from_version")
                    updated_at = _serialize_timestamp(changes_data.get("updatedAt"))
            return {
                "version": version,
                "download_url": get_presigned_download_url(CONTENT_PUBLIC_BASE_URL, version),
                "artifact_sha256": data.get("artifact_sha256", ""),
                "from_version": from_version,
                "changes": changes,
                "updatedAt": updated_at,
            }

    raise HTTPException(status_code=404, detail="No published content yet")
