"""
Seed courses from content JSON files.
Run: python -m app.scripts.seed_courses
Idempotent — safe to run multiple times.
"""

import os
import json
from datetime import datetime

from firebase_admin import firestore

from app.core import firebase_config  # noqa: F401 — initialize Firebase Admin

db = firestore.client()

CONTENT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "next-app", "content",
)


def load_courses_from_content() -> list[dict]:
    index_path = os.path.join(CONTENT_DIR, "index.json")
    with open(index_path, encoding="utf-8") as f:
        catalog = json.load(f)

    courses = []
    for entry in catalog["courses"]:
        course_path = os.path.join(CONTENT_DIR, "courses", entry["id"], "course.json")
        with open(course_path, encoding="utf-8") as f:
            data = json.load(f)

        total_modules = len(data.get("modules", []))
        total_labs = sum(len(m.get("labs", [])) for m in data.get("modules", []))

        courses.append({
            "id": entry["id"],
            "title": entry["title"],
            "description": entry["description"],
            "slug": entry["id"],
            "modules": total_modules,
            "labs": total_labs,
            "level": entry["level"],
            "createdAt": datetime.utcnow(),
        })

    return courses


def seed():
    courses = load_courses_from_content()
    for course in courses:
        db.collection("courses").document(course["id"]).set(course)
        print(f"  ✓ {course['title']} ({course['modules']} module(s), {course['labs']} labs)")


if __name__ == "__main__":
    print("Seeding courses from content files…")
    seed()
    print("Done.")
