from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import firebase_config  # Initialize Firebase Admin SDK
from app.utils.firebase_util import verify_firebase_token
from app.routers import users, courses, content


app = FastAPI(title="LABOPS BACKEND")

# Development-friendly CORS. Narrow this before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(courses.router)
app.include_router(content.router)


@app.get("/")
def root():
    return {"message": "SGP Firebase reference backend running"}


from app.core.firestore_db import db
from google.cloud import firestore

@app.get("/healthz")
def healthz():
    try:
        # Check Firestore connectivity with a lightweight query
        db.collection("users").limit(1).get()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": "disconnected", "detail": str(e)}


@app.get("/auth/me")
async def auth_me(firebase_data=Depends(verify_firebase_token)):
    return {
        "status": "authenticated",
        "uid": firebase_data.get("uid"),
        "email": firebase_data.get("email"),
        "name": firebase_data.get("name") or firebase_data.get("full_name"),
    }
