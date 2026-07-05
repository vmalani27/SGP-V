import firebase_admin
from firebase_admin import credentials
import logging
import os
import json


def _load_firebase_credential() -> tuple[credentials.Base, str]:
    raw_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if raw_json:
        try:
            payload = json.loads(raw_json)
            return credentials.Certificate(payload), "FIREBASE_CREDENTIALS_JSON"
        except Exception as exc:
            raise RuntimeError(f"Invalid FIREBASE_CREDENTIALS_JSON: {exc}") from exc

    explicit_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
    if explicit_path:
        if not os.path.exists(explicit_path):
            raise RuntimeError(
                f"FIREBASE_CREDENTIALS_PATH does not exist: {explicit_path}"
            )
        return credentials.Certificate(explicit_path), "FIREBASE_CREDENTIALS_PATH"

    gac_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if gac_path:
        if not os.path.exists(gac_path):
            raise RuntimeError(
                "GOOGLE_APPLICATION_CREDENTIALS is set but file does not exist: "
                f"{gac_path}"
            )
        return credentials.Certificate(gac_path), "GOOGLE_APPLICATION_CREDENTIALS"

    local_path = os.path.join(os.path.dirname(__file__), "credentials.json")
    if os.path.exists(local_path):
        return credentials.Certificate(local_path), local_path

    return credentials.ApplicationDefault(), "ApplicationDefault"


project_id = os.getenv("FIREBASE_PROJECT_ID")

if not firebase_admin._apps:
    try:
        cred, source = _load_firebase_credential()
        options = {"projectId": project_id} if project_id else None
        firebase_admin.initialize_app(cred, options)
        logging.info(
            "Firebase Admin initialized successfully (source=%s, project_id=%s).",
            source,
            project_id or "auto",
        )
    except Exception as e:
        logging.critical("Firebase Admin initialization failed: %s", e)
        raise
