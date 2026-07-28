"""
Content API — backend owns content serving.

All course content flows through this router. The content provider
abstracts the storage layer (filesystem now, S3 later). No other
service serves course content to the frontend.

Future: when CONTENT_SOURCE=s3, the provider reads from S3 instead
of the local filesystem. The router and all API contracts stay the same.
"""

from fastapi import APIRouter, HTTPException

from app.services.content_provider import get_content_provider

router = APIRouter(prefix="/api/v1/content", tags=["content"])


@router.get("/courses")
async def list_courses():
    provider = get_content_provider()
    courses = provider.list_courses()
    return {"courses": courses}


@router.get("/courses/{course_id}")
async def get_course(course_id: str):
    provider = get_content_provider()
    course = provider.get_course(course_id)
    if course is None:
        raise HTTPException(status_code=404, detail=f"Course '{course_id}' not found")
    return course


@router.get("/courses/{course_id}/chapters/{chapter_id}")
async def get_chapter_content(course_id: str, chapter_id: str):
    provider = get_content_provider()

    course = provider.get_course(course_id)
    if course is None:
        raise HTTPException(status_code=404, detail=f"Course '{course_id}' not found")

    for module in course.get("modules", []):
        for chapter in module.get("chapters", []):
            if chapter["id"] == chapter_id:
                content = provider.get_chapter_content(course_id, chapter_id)
                return {
                    "chapter": {**chapter, "moduleId": module["id"]},
                    "content": content,
                }

    raise HTTPException(status_code=404, detail=f"Chapter '{chapter_id}' not found in course '{course_id}'")


@router.get("/courses/{course_id}/labs")
async def list_labs(course_id: str):
    provider = get_content_provider()
    course = provider.get_course(course_id)
    if course is None:
        raise HTTPException(status_code=404, detail=f"Course '{course_id}' not found")

    labs = []
    for module in course.get("modules", []):
        for lab in module.get("labs", []):
            labs.append({
                "id": lab["id"],
                "title": lab.get("title", ""),
                "module_id": module["id"],
                "chapter_id": lab.get("chapterId", ""),
            })
    return {"course_id": course_id, "labs": labs}


@router.get("/courses/{course_id}/labs/{lab_id}/instructions")
async def get_lab_instructions(course_id: str, lab_id: str):
    provider = get_content_provider()
    result = provider.get_lab_instructions(course_id, lab_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Lab '{lab_id}' not found in course '{course_id}'")
    return result


@router.get("/courses/{course_id}/labs/{lab_id}/config")
async def get_lab_config(course_id: str, lab_id: str):
    provider = get_content_provider()
    result = provider.get_lab_config(course_id, lab_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Lab '{lab_id}' config not found in course '{course_id}'")
    return result
