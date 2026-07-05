"""
One-time seed script for course data.
Run: python -m app.scripts.seed_courses
Idempotent — safe to run multiple times.
"""

from firebase_admin import firestore
from datetime import datetime

from app.core import firebase_config  # noqa: F401 — initialize Firebase Admin

db = firestore.client()

COURSES = [
    {
        "id": "git-fundamentals",
        "title": "Git Fundamentals",
        "description": "From your first commit to advanced branching strategies and CI/CD integration. Master version control, collaboration, and professional Git workflows.",
        "slug": "git-fundamentals",
        "modules": 1,
        "labs": 10,
        "level": "beginner",
        "createdAt": datetime.utcnow(),
    },
    {
        "id": "docker-mastery",
        "title": "Docker Mastery",
        "description": "Containers, multi-stage builds, Docker Compose, and production-ready deployments. Learn to containerize applications and manage containerized workflows.",
        "slug": "docker-mastery",
        "modules": 1,
        "labs": 10,
        "level": "intermediate",
        "createdAt": datetime.utcnow(),
    },
]


def seed():
    for course in COURSES:
        db.collection("courses").document(course["id"]).set(course)
        print(f"  ✓ {course['title']} ({course['labs']} labs)")


if __name__ == "__main__":
    print("Seeding courses…")
    seed()
    print("Done.")
