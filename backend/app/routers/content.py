"""
Content API — metadata + delivery handshake only.

The backend no longer serves course files. Course catalog + TOC metadata is
served from Firestore (see courses.py), and the content payload itself is
downloaded by the client from S3. This router exposes the version handshake
the client uses to bootstrap and integrity-check its local content store.
"""

from fastapi import APIRouter, HTTPException

from app.config import CONTENT_PUBLIC_BASE_URL
from app.core.firestore_db import db

router = APIRouter(prefix="/api/v1/content", tags=["content"])


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
                "download_url": f"{CONTENT_PUBLIC_BASE_URL}/published/{version}/content.tar.gz",
                "artifact_sha256": data.get("artifact_sha256", ""),
                "from_version": from_version,
                "changes": changes,
                "updatedAt": updated_at,
            }

    raise HTTPException(status_code=404, detail="No published content yet")
