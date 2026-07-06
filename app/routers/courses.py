import os
import json
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime

from app.core.firestore_db import db
from app.utils.firebase_util import verify_firebase_token
from app.models.course import Course

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])

CONTENT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "next-app", "content",
)


def _get_course_lab_count(course_id: str) -> int:
    """Read total lab count from the content course.json."""
    try:
        path = os.path.join(CONTENT_DIR, "courses", course_id, "course.json")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return sum(len(m.get("labs", [])) for m in data.get("modules", []))
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return 0


def _compute_percentage(progress: dict, course_id: str) -> dict:
    """Derive overall percentage from progress map. Returns enriched progress."""
    total_labs = _get_course_lab_count(course_id)
    if total_labs == 0:
        return {"percentage": 0}

    completed = 0
    for mod_val in progress.values():
        if isinstance(mod_val, dict):
            for lab_status in mod_val.values():
                if lab_status == "completed":
                    completed += 1

    pct = round((completed / total_labs) * 100)
    return {"percentage": pct, "completedLabs": completed, "totalLabs": total_labs}


@router.get("")
async def list_courses() -> list[dict]:
    courses = db.collection("courses").stream()
    return [c.to_dict() for c in courses]


@router.get("/{course_id}")
async def get_course(course_id: str) -> dict:
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


@router.post("/{course_id}/labs/{lab_id}/complete")
async def complete_lab(
    course_id: str,
    lab_id: str,
    firebase_data: dict = Depends(verify_firebase_token),
) -> dict:
    uid = firebase_data["uid"]
    enrollment_ref = db.collection("enrollments").document(f"{uid}_{course_id}")
    doc = enrollment_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Not enrolled in this course")

    enrollment = doc.to_dict()
    progress = enrollment.get("progress", {})

    # Find which module this lab belongs to by reading the content file
    mod_id = None
    try:
        course_path = os.path.join(CONTENT_DIR, "courses", course_id, "course.json")
        with open(course_path, encoding="utf-8") as f:
            course_data = json.load(f)
        for mod in course_data.get("modules", []):
            for lab in mod.get("labs", []):
                if lab["id"] == lab_id:
                    mod_id = mod["id"]
                    break
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        pass

    if mod_id is None:
        raise HTTPException(status_code=404, detail="Lab not found in course content")

    if mod_id not in progress:
        progress[mod_id] = {}

    progress[mod_id][lab_id] = "completed"

    enrollment_ref.update({
        "progress": progress,
        "lastAccessed": datetime.utcnow(),
    })

    enriched = _compute_percentage(progress, course_id)
    return {
        "status": "ok",
        "labId": lab_id,
        "progress": progress,
        **enriched,
    }


@router.get("/{course_id}/progress")
async def get_progress(
    course_id: str,
    firebase_data: dict = Depends(verify_firebase_token),
) -> dict:
    uid = firebase_data["uid"]
    enrollment_ref = db.collection("enrollments").document(f"{uid}_{course_id}")
    doc = enrollment_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Not enrolled in this course")

    result = doc.to_dict()
    enriched = _compute_percentage(result.get("progress", {}), course_id)
    result.update(enriched)
    return result
