from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import firebase_config  # Initialize Firebase Admin SDK
from app.utils.firebase_util import verify_firebase_token
from app.routers import users, courses, content, labs, demos


app = FastAPI(title="SGP Firebase Reference Backend")

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
app.include_router(labs.router)
app.include_router(demos.router)


@app.get("/")
def root():
    return {"message": "SGP Firebase reference backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/auth/me")
async def auth_me(firebase_data=Depends(verify_firebase_token)):
    return {
        "status": "authenticated",
        "uid": firebase_data.get("uid"),
        "email": firebase_data.get("email"),
        "name": firebase_data.get("name") or firebase_data.get("full_name"),
    }
