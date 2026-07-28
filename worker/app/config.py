import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

CONTENT_DIR = os.environ.get("CONTENT_DIR", "/app/content-v2")
SYNC_INTERVAL_SECONDS = int(os.environ.get("SYNC_INTERVAL_SECONDS", "300"))
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
FIREBASE_CREDENTIALS_JSON = os.environ.get("FIREBASE_CREDENTIALS_JSON", "")
FIREBASE_CREDENTIALS_PATH = os.environ.get("FIREBASE_CREDENTIALS_PATH", "")
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")

_db = None


def get_firestore() -> firestore.Client:
    global _db
    if _db is not None:
        return _db
    _init_firebase()
    _db = firestore.client()
    return _db


def _init_firebase():
    if firebase_admin._apps:
        return

    cred_source = None
    cred = None

    if FIREBASE_CREDENTIALS_JSON:
        try:
            payload = json.loads(FIREBASE_CREDENTIALS_JSON)
            cred = credentials.Certificate(payload)
            cred_source = "FIREBASE_CREDENTIALS_JSON"
        except Exception as exc:
            raise RuntimeError(f"Invalid FIREBASE_CREDENTIALS_JSON: {exc}") from exc

    if cred is None and FIREBASE_CREDENTIALS_PATH and os.path.exists(FIREBASE_CREDENTIALS_PATH):
        cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
        cred_source = "FIREBASE_CREDENTIALS_PATH"

    if cred is None and GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(GOOGLE_APPLICATION_CREDENTIALS):
        cred = credentials.Certificate(GOOGLE_APPLICATION_CREDENTIALS)
        cred_source = "GOOGLE_APPLICATION_CREDENTIALS"

    if cred is None:
        cred = credentials.ApplicationDefault()
        cred_source = "ApplicationDefault"

    options = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None
    firebase_admin.initialize_app(cred, options)
