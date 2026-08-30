import firebase_admin
from firebase_admin import credentials
import logging
import os
import json


CREDENTIALS_PATH = os.path.join(
    os.path.dirname(__file__),
    "credentials.json"
)

project_id = os.getenv("FIREBASE_PROJECT_ID")

if not project_id:
    raise RuntimeError("FIREBASE_PROJECT_ID is not set")

if not firebase_admin._apps:
    try:
        # First check if credentials were provided directly via environment variable
        creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        if creds_json:
            creds_dict = json.loads(creds_json)
            cred = credentials.Certificate(creds_dict)
        else:
            # Fallback to local file for development
            if not os.path.exists(CREDENTIALS_PATH):
                raise RuntimeError(f"Firebase credentials not found in env var FIREBASE_CREDENTIALS_JSON or file {CREDENTIALS_PATH}")
            cred = credentials.Certificate(CREDENTIALS_PATH)

        firebase_admin.initialize_app(
            cred,
            {
                "projectId": project_id
            }
        )

        logging.info(
            "Firebase Admin initialized successfully (project_id=%s)",
            project_id
        )

    except Exception as exc:
        logging.critical(
            "Firebase Admin initialization failed: %s",
            exc
        )
        raise