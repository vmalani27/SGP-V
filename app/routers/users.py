from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime

from app.core.firestore_db import db
from app.utils.firebase_util import verify_firebase_token
from app.models.user import UserSyncResponse

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class UpdateProfileRequest(BaseModel):
    displayName: str | None = None
    profileComplete: bool | None = None


@router.post("/sync")
async def sync_user(firebase_data: dict = Depends(verify_firebase_token)) -> UserSyncResponse:
    uid = firebase_data["uid"]
    email = firebase_data.get("email", "")
    name = firebase_data.get("name") or firebase_data.get("full_name", "")

    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()

    if user_doc.exists:
        user_ref.update({"lastLogin": datetime.utcnow()})
        data = user_doc.to_dict()
        return UserSyncResponse(
            uid=uid,
            email=data.get("email", email),
            displayName=data.get("displayName", name),
            enrolledCourses=data.get("enrolledCourses", []),
            profileComplete=data.get("profileComplete", False),
            isNew=False,
        )

    user_data = {
        "uid": uid,
        "email": email,
        "displayName": name,
        "createdAt": datetime.utcnow(),
        "lastLogin": datetime.utcnow(),
        "enrolledCourses": [],
        "profileComplete": False,
    }
    user_ref.set(user_data)
    return UserSyncResponse(
        uid=uid,
        email=email,
        displayName=name,
        enrolledCourses=[],
        profileComplete=False,
        isNew=True,
    )


@router.get("/me")
async def get_profile(firebase_data: dict = Depends(verify_firebase_token)) -> dict:
    uid = firebase_data["uid"]
    user_doc = db.collection("users").document(uid).get()
    if not user_doc.exists:
        return {"uid": uid, "enrolledCourses": []}
    return user_doc.to_dict()


@router.put("/me")
async def update_profile(
    body: UpdateProfileRequest,
    firebase_data: dict = Depends(verify_firebase_token),
) -> dict:
    uid = firebase_data["uid"]
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found. Sync first.")

    updates: dict = {}
    if body.displayName is not None:
        updates["displayName"] = body.displayName
    if body.profileComplete is not None:
        updates["profileComplete"] = body.profileComplete

    if updates:
        user_ref.update(updates)

    updated = user_ref.get().to_dict()
    return updated


@router.get("/me/enrollments")
async def get_enrollments(firebase_data: dict = Depends(verify_firebase_token)) -> list:
    uid = firebase_data["uid"]
    enrollments = (
        db.collection("enrollments")
        .where("userId", "==", uid)
        .stream()
    )
    return [e.to_dict() for e in enrollments]
