"""
Labs API — backend proxies lab lifecycle to orchestrator.

The backend reads the lab YAML from content-v2, extracts the environment
config, and forwards it to the orchestrator. The frontend never talks
to the orchestrator directly.

JWT tokens are generated for WebSocket auth — the frontend connects
directly to the orchestrator WebSocket with a short-lived token.
"""

import logging
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import JWT_ALGORITHM, JWT_EXPIRY_MINUTES, JWT_SECRET, ORCHESTRATOR_URL, WS_ORCHESTRATOR_URL
from app.services.content_provider import get_content_provider
from app.utils.firebase_util import verify_firebase_token

logger = logging.getLogger("backend.labs")

router = APIRouter(prefix="/api/v1/labs", tags=["labs"])


class StartLabResponse(BaseModel):
    session_id: str
    lab_id: str
    container_name: str
    status: str
    ws_token: str
    ws_url: str


class TokenResponse(BaseModel):
    ws_token: str
    ws_url: str


def _generate_ws_token(session_id: str, user_id: str, lab_id: str) -> str:
    payload = {
        "session_id": session_id,
        "user_id": user_id,
        "lab_id": lab_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRY_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _build_ws_url(container_name: str, token: str) -> str:
    return f"{WS_ORCHESTRATOR_URL}/ws/{container_name}/terminal?token={token}"


@router.post("/courses/{course_id}/labs/{lab_id}/start")
async def start_lab(
    course_id: str,
    lab_id: str,
    firebase_data=Depends(verify_firebase_token),
):
    """Read lab YAML, extract environment config, forward to orchestrator."""
    user_id = firebase_data.get("uid", "")

    provider = get_content_provider()
    config = provider.get_lab_config(course_id, lab_id)
    if config is None:
        raise HTTPException(
            status_code=404,
            detail=f"Lab '{lab_id}' config not found in course '{course_id}'",
        )

    environment = config.get("environment", {})
    image = environment.get("base_image")
    if not image:
        raise HTTPException(
            status_code=422,
            detail=f"Lab '{lab_id}' YAML is missing environment.base_image",
        )

    orch_payload = {
        "lab_id": lab_id,
        "image": image,
        "apt_packages": environment.get("apt_packages", []),
        "pre_pull": environment.get("pre_pull", []),
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(f"{ORCHESTRATOR_URL}/labs", json=orch_payload)
        except httpx.ConnectError:
            raise HTTPException(
                status_code=502,
                detail="Cannot connect to orchestrator",
            )

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    data = resp.json()
    ws_token = _generate_ws_token(data["session_id"], user_id, lab_id)
    ws_url = _build_ws_url(data["container_name"], ws_token)

    return StartLabResponse(
        session_id=data["session_id"],
        lab_id=data["lab_id"],
        container_name=data["container_name"],
        status=data["status"],
        ws_token=ws_token,
        ws_url=ws_url,
    )


@router.post("/courses/{course_id}/labs/{lab_id}/token/{session_id}")
async def refresh_token(
    course_id: str,
    lab_id: str,
    session_id: str,
    firebase_data=Depends(verify_firebase_token),
):
    """Issue a fresh WebSocket token for an existing session."""
    user_id = firebase_data.get("uid", "")

    # Verify session still exists in orchestrator
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{ORCHESTRATOR_URL}/labs/{session_id}")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Session not found")

    container_name = resp.json().get("container_name", "")
    ws_token = _generate_ws_token(session_id, user_id, lab_id)
    ws_url = _build_ws_url(container_name, ws_token)

    return TokenResponse(ws_token=ws_token, ws_url=ws_url)


@router.get("/courses/{course_id}/labs/{lab_id}/status/{session_id}")
async def lab_status(course_id: str, lab_id: str, session_id: str):
    """Proxy session status from orchestrator."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{ORCHESTRATOR_URL}/labs/{session_id}")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json()


@router.post("/courses/{course_id}/labs/{lab_id}/stop/{session_id}")
async def stop_lab(course_id: str, lab_id: str, session_id: str):
    """Proxy stop to orchestrator."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(f"{ORCHESTRATOR_URL}/labs/{session_id}/stop")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json()


@router.post("/courses/{course_id}/labs/{lab_id}/resume/{session_id}")
async def resume_lab(course_id: str, lab_id: str, session_id: str):
    """Proxy resume to orchestrator."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(f"{ORCHESTRATOR_URL}/labs/{session_id}/resume")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json()


@router.delete("/courses/{course_id}/labs/{lab_id}/{session_id}")
async def destroy_lab(course_id: str, lab_id: str, session_id: str):
    """Proxy destroy to orchestrator."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.delete(f"{ORCHESTRATOR_URL}/labs/{session_id}")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json()


@router.post("/courses/{course_id}/labs/{lab_id}/exec/{session_id}")
async def exec_command(course_id: str, lab_id: str, session_id: str, body: dict):
    """Proxy exec to orchestrator."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{ORCHESTRATOR_URL}/labs/{session_id}/exec",
                json=body,
            )
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json()
