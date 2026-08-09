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


@router.get("/version")
async def content_version() -> dict:
    """Return the published content version + S3 download pointer.

    Reads contentVersion/artifact_sha256 from any Firestore course document
    (the worker writes them on every sync). download_url is derived from the
    configured public base URL, which the client fetches directly.
    """
    for doc in db.collection("courses").stream():
        data = doc.to_dict()
        version = data.get("contentVersion")
        if version:
            return {
                "version": version,
                "download_url": f"{CONTENT_PUBLIC_BASE_URL}/published/{version}/content.tar.gz",
                "artifact_sha256": data.get("artifact_sha256", ""),
            }

    raise HTTPException(status_code=404, detail="No published content yet")
