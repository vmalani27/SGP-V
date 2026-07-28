import json
import os

from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse

SCHEMAS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "schemas")

router = APIRouter(prefix="/schemas", tags=["schemas"])


@router.get("/yaml")
def get_json_schema():
    path = os.path.join(SCHEMAS_DIR, "lab-schema.json")
    if not os.path.exists(path):
        return JSONResponse(status_code=500, content={"detail": "Schema file not found"})
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@router.get("/sample")
def get_sample_yaml():
    path = os.path.join(SCHEMAS_DIR, "lab-sample.yaml")
    if not os.path.exists(path):
        return JSONResponse(status_code=500, content={"detail": "Sample file not found"})
    return FileResponse(
        path=path,
        media_type="application/x-yaml",
        filename="lab-sample.yaml",
    )
