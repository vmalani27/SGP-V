"""
Labs API — backend proxies lab lifecycle to orchestrator.

The backend reads the lab YAML from content-v2, extracts the environment
config, and forwards it to the orchestrator. The frontend never talks
to the orchestrator directly.

JWT tokens are generated for WebSocket auth — the frontend connects
directly to the orchestrator WebSocket with a short-lived token.

Active sessions are tracked in-memory so users can reconnect to a paused
lab instead of creating a duplicate session.
"""

import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import JWT_ALGORITHM, JWT_EXPIRY_MINUTES, JWT_SECRET, ORCHESTRATOR_URL, WS_ORCHESTRATOR_URL
from app.services.content_provider import get_content_provider
from app.utils.firebase_util import verify_firebase_token

logger = logging.getLogger("backend.labs")

router = APIRouter(prefix="/api/v1/labs", tags=["labs"])

# Track active sessions per user per lab so we can reconnect on page reload.
# Key: f"{user_id}:{course_id}:{lab_id}"  Value: session info dict
active_sessions: dict[str, dict] = {}


def _session_key(user_id: str, course_id: str, lab_id: str) -> str:
    return f"{user_id}:{course_id}:{lab_id}"


class ActiveSessionResponse(BaseModel):
    session_id: str
    lab_id: str
    container_name: str
    status: str
    ws_token: str
    ws_url: str


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


class ValidateTaskRequest(BaseModel):
    task_id: str
    answer: str | None = None


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


def _require_active_session(user_id: str, course_id: str, lab_id: str) -> dict:
    """Return the tracked session for this user+lab, or 404."""
    key = _session_key(user_id, course_id, lab_id)
    entry = active_sessions.get(key)
    if not entry:
        raise HTTPException(
            status_code=404,
            detail="No active session for this lab. Start the lab first.",
        )
    return entry


def _extract_tasks(config: dict, lab_id: str) -> list[dict]:
    """Extract the ordered task list from flat or monolithic lab YAML."""
    tasks = config.get("tasks", [])
    if tasks:
        return tasks
    for phase in config.get("phases", []):
        for lab in phase.get("labs", []):
            if lab.get("id") == lab_id:
                return lab.get("tasks", [])
    return []


def _find_lab_task(config: dict, lab_id: str, task_id: str) -> dict:
    for task in _extract_tasks(config, lab_id):
        if task.get("id") == task_id:
            return task
    raise HTTPException(
        status_code=404,
        detail=f"Task '{task_id}' not found in lab '{lab_id}'",
    )


async def _run_orchestrator_exec(session_id: str, command: str) -> str:
    """Proxy an exec to the orchestrator and return combined output."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{ORCHESTRATOR_URL}/labs/{session_id}/exec",
                json={"command": command, "user": "student"},
            )
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json().get("output", "")


def _match_output(output: str, validation: dict) -> bool:
    match_type = validation.get("match_type", "contains")
    expected = str(validation.get("expected_output", ""))
    out = output.strip()
    if match_type == "exact":
        return out == expected.strip()
    if match_type == "regex":
        try:
            return re.search(expected, out) is not None
        except re.error:
            return False
    if match_type == "line_count":
        try:
            return len(out.splitlines()) == int(expected)
        except ValueError:
            return False
    return expected in out


def _first_line(text: str) -> str:
    """Return the first non-empty line of command output (strips stderr noise)."""
    line = text.strip().splitlines()[0] if text.strip() else ""
    return line.strip()


def _build_options(correct: str) -> list[str]:
    """Build a small option set around the correct answer for dynamic MC tasks."""
    correct = _first_line(correct)
    try:
        n = int(correct)
        start = max(0, n - 2)
        return [str(i) for i in range(start, n + 3)]
    except ValueError:
        return [correct, "Yes", "No"]


@router.get("/courses/{course_id}/labs/{lab_id}/active")
async def get_active_session(
    course_id: str,
    lab_id: str,
    firebase_data=Depends(verify_firebase_token),
):
    """Return the active session for this user+lab, or null if none exists.

    Verifies the session still exists in the orchestrator before returning.
    """
    user_id = firebase_data.get("uid", "")
    key = _session_key(user_id, course_id, lab_id)
    entry = active_sessions.get(key)
    if not entry:
        return None

    # Verify session still exists in orchestrator
    session_id = entry["session_id"]
    container_name = entry["container_name"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{ORCHESTRATOR_URL}/labs/{session_id}")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code == 404:
        # Session was destroyed externally — clean up
        del active_sessions[key]
        return None

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Failed to verify session")

    data = resp.json()
    ws_token = _generate_ws_token(session_id, user_id, lab_id)
    ws_url = _build_ws_url(container_name, ws_token)

    return ActiveSessionResponse(
        session_id=session_id,
        lab_id=data.get("lab_id", lab_id),
        container_name=container_name,
        status=data["status"],
        ws_token=ws_token,
        ws_url=ws_url,
    )


@router.post("/courses/{course_id}/labs/{lab_id}/start")
async def start_lab(
    course_id: str,
    lab_id: str,
    firebase_data=Depends(verify_firebase_token),
):
    """Read lab YAML, extract environment config, forward to orchestrator."""
    user_id = firebase_data.get("uid", "")

    # Destroy any existing session for this user+lab first
    key = _session_key(user_id, course_id, lab_id)
    existing = active_sessions.get(key)
    if existing:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await client.delete(f"{ORCHESTRATOR_URL}/labs/{existing['session_id']}")
        except Exception:
            pass
        del active_sessions[key]

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
        "user_id": user_id,
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

    # Track this session
    active_sessions[key] = {
        "session_id": data["session_id"],
        "container_name": data["container_name"],
    }

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
async def destroy_lab(
    course_id: str,
    lab_id: str,
    session_id: str,
    firebase_data=Depends(verify_firebase_token),
):
    """Proxy destroy to orchestrator and clean up session tracking."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.delete(f"{ORCHESTRATOR_URL}/labs/{session_id}")
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    # Clean up session tracking
    user_id = firebase_data.get("uid", "")
    key = _session_key(user_id, course_id, lab_id)
    active_sessions.pop(key, None)

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


@router.get("/courses/{course_id}/labs/{lab_id}/tasks")
async def get_lab_tasks(
    course_id: str,
    lab_id: str,
    firebase_data=Depends(verify_firebase_token),
):
    """Return the lab's task list for an active session.

    For dynamic multiple-choice tasks, resolves the answer options by
    running the task's validation command inside the container.
    """
    user_id = firebase_data.get("uid", "")
    entry = _require_active_session(user_id, course_id, lab_id)

    provider = get_content_provider()
    config = provider.get_lab_config(course_id, lab_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Lab '{lab_id}' config not found")

    tasks = _extract_tasks(config, lab_id)

    for task in tasks:
        if (
            task.get("type") == "multiple_choice"
            and task.get("options_source") == "dynamic"
            and not task.get("options")
        ):
            cmd = task.get("validation", {}).get("command")
            if not cmd:
                continue
            try:
                output = await _run_orchestrator_exec(entry["session_id"], cmd)
                task["options"] = _build_options(output)
            except HTTPException:
                task["options"] = ["0", "1", "2", "3"]

    return {"lab_id": lab_id, "tasks": tasks}


@router.post("/courses/{course_id}/labs/{lab_id}/validate")
async def validate_task(
    course_id: str,
    lab_id: str,
    body: ValidateTaskRequest,
    firebase_data=Depends(verify_firebase_token),
):
    """Validate a single task against the live container state.

    - multiple_choice: answer is checked against validation.expected_output
      (static) or against the output of validation.command (dynamic).
    - command tasks: validation.command is run as the student and its output
      is compared using match_type (exact / contains / regex / line_count).
    - file_check: validation.path must contain validation.contains.
    """
    user_id = firebase_data.get("uid", "")
    entry = _require_active_session(user_id, course_id, lab_id)

    provider = get_content_provider()
    config = provider.get_lab_config(course_id, lab_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f"Lab '{lab_id}' config not found")

    task = _find_lab_task(config, lab_id, body.task_id)
    task_type = task.get("type", "terminal_action")
    validation = task.get("validation", {})

    def _result(correct: bool, output: str = "") -> JSONResponse:
        return JSONResponse(content={
            "correct": correct,
            "output": output,
            "error": None if correct else task.get("error_message"),
            "hint": task.get("hint"),
        })

    if task_type == "multiple_choice":
        expected = validation.get("expected_output")
        if expected is not None:
            return _result((body.answer or "").strip() == str(expected).strip())
        cmd = validation.get("command")
        if not cmd:
            return JSONResponse(status_code=501, content={
                "detail": "Dynamic multiple_choice without a validation command is not supported",
            })
        output = await _run_orchestrator_exec(entry["session_id"], cmd)
        return _result((body.answer or "").strip() == _first_line(output), output)

    if task_type == "file_check":
        path = validation.get("path")
        contains = validation.get("contains")
        if not path or contains is None:
            return JSONResponse(status_code=501, content={
                "detail": "file_check requires validation.path and validation.contains",
            })
        output = await _run_orchestrator_exec(entry["session_id"], f"cat {path} 2>/dev/null")
        return _result(contains in output, output)

    if task_type == "port_check":
        cmd = validation.get("command")
        if not cmd:
            return JSONResponse(status_code=501, content={
                "detail": "port_check validation is not supported yet",
            })
        output = await _run_orchestrator_exec(entry["session_id"], cmd)
        return _result(_match_output(output, validation), output)

    cmd = validation.get("command")
    if not cmd:
        return JSONResponse(status_code=501, content={
            "detail": f"Task type '{task_type}' requires validation.command",
        })
    output = await _run_orchestrator_exec(entry["session_id"], cmd)
    return _result(_match_output(output, validation), output)
