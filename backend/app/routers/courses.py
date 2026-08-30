from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime

from app.core.firestore_db import db
from app.utils.firebase_util import verify_firebase_token
from app.models.course import Course, Enrollment

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])


class UpdateProgressRequest(BaseModel):
    moduleId: str
    chapterId: str
    status: str = "completed"


class UpdateLabProgressRequest(BaseModel):
    moduleId: str
    status: str = "completed"


@router.get("", response_model=list[Course])
async def list_courses():
    courses = db.collection("courses").stream()
    return [c.to_dict() for c in courses]


@router.get("/{course_id}", response_model=Course)
async def get_course(course_id: str):
    doc = db.collection("courses").document(course_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Course not found")
    return doc.to_dict()


@router.post("/{course_id}/enroll")
async def enroll_in_course(
    course_id: str,
    firebase_data: dict = Depends(verify_firebase_token),
) -> dict:
    uid = firebase_data["uid"]

    course_doc = db.collection("courses").document(course_id).get()
    if not course_doc.exists:
        raise HTTPException(status_code=404, detail="Course not found")

    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found. Sync first.")

    user_data = user_doc.to_dict()
    enrolled = user_data.get("enrolledCourses", [])

    if course_id not in enrolled:
        enrolled.append(course_id)
        user_ref.update({"enrolledCourses": enrolled})

    enrollment_ref = db.collection("enrollments").document(f"{uid}_{course_id}")
    if not enrollment_ref.get().exists:
        enrollment_ref.set({
            "userId": uid,
            "courseId": course_id,
            "enrolledAt": datetime.utcnow(),
            "progress": {},
            "lastAccessed": datetime.utcnow(),
            "status": "in-progress",
        })

    return {"status": "enrolled", "courseId": course_id}


@router.get("/{course_id}/progress", response_model=Enrollment)
async def get_progress(
    course_id: str,
    firebase_data: dict = Depends(verify_firebase_token),
):
    uid = firebase_data["uid"]
    enrollment_ref = db.collection("enrollments").document(f"{uid}_{course_id}")
    doc = enrollment_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Not enrolled in this course")

    return doc.to_dict()


@router.put("/{course_id}/progress")
async def update_progress(
    course_id: str,
    body: UpdateProgressRequest,
    firebase_data: dict = Depends(verify_firebase_token),
) -> dict:
    uid = firebase_data["uid"]
    enrollment_ref = db.collection("enrollments").document(f"{uid}_{course_id}")
    doc = enrollment_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Not enrolled in this course")

    data = doc.to_dict()
    progress = data.get("progress", {})

    mod_progress = progress.get(body.moduleId, {})
    mod_progress[body.chapterId] = body.status
    progress[body.moduleId] = mod_progress

    enrollment_ref.update({
        "progress": progress,
        "lastAccessed": datetime.utcnow(),
    })

    return {"status": "ok", "progress": progress}


@router.put("/{course_id}/labs/{lab_id}/progress")
async def update_lab_progress(
    course_id: str,
    lab_id: str,
    body: UpdateLabProgressRequest,
    firebase_data: dict = Depends(verify_firebase_token),
) -> dict:
    uid = firebase_data["uid"]
    enrollment_ref = db.collection("enrollments").document(f"{uid}_{course_id}")
    doc = enrollment_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Not enrolled in this course")

    data = doc.to_dict()
    labs_progress = data.get("labsProgress", {})

    mod_labs = labs_progress.get(body.moduleId, {})
    mod_labs[lab_id] = body.status
    labs_progress[body.moduleId] = mod_labs

    enrollment_ref.update({
        "labsProgress": labs_progress,
        "lastAccessed": datetime.utcnow(),
    })

    return {"status": "ok", "labsProgress": labs_progress}
