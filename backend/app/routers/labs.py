"""
Labs API — backend proxies lab lifecycle to orchestrator.

The client serves the lab config locally (downloaded content) and supplies
the environment config + task validation specs in the request bodies. The
backend never reads content files — it only forwards lab lifecycle to the
orchestrator. The frontend never talks to the orchestrator directly.

The browser connects to the backend's own WebSocket endpoint
(/api/v1/labs/ws/lab) and authenticates with a short-lived JWT sent as the
first message — never in the URL. The backend validates it and bridges
terminal frames to the orchestrator's internal WebSocket.

Active sessions are a read-through cache: the orchestrator is the source of
truth, queryable by Docker labels via GET /labs/by_key. This lets the backend
re-attach to a live container after a restart instead of spawning a duplicate.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
import jwt
import websockets
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import JWT_ALGORITHM, JWT_EXPIRY_MINUTES, JWT_SECRET, ORCHESTRATOR_URL, WS_ORCHESTRATOR_URL
from app.utils.firebase_util import verify_firebase_token

logger = logging.getLogger("backend.labs")

router = APIRouter(prefix="/api/v1/labs", tags=["labs"])

# Read-through cache of active sessions per user per lab.
# Key: f"{user_id}:{course_id}:{lab_id}"  Value: session info dict
# Source of truth is the orchestrator (Docker labels via /labs/by_key).
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


class StartLabRequest(BaseModel):
    """Environment config supplied by the client from its local lab config."""

    image: str
    apt_packages: list[str] = []
    pre_pull: list[str] = []
    setup: list[dict] = []


class LabTasksRequest(BaseModel):
    """Task list supplied by the client from its local lab config."""

    tasks: list[dict] = []


class ValidateTaskRequest(BaseModel):
    task_id: str
    answer: str | None = None
    task_type: str = "terminal_action"
    validation: dict[str, object] = {}
    error_message: str | None = None
    hint: str | None = None


def _generate_ws_token(session_id: str, user_id: str, lab_id: str) -> str:
    payload = {
        "session_id": session_id,
        "user_id": user_id,
        "lab_id": lab_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRY_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _verify_ws_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _build_ws_url(request: Request) -> str:
    """Browser-facing WebSocket URL on the backend itself.

    The token is never placed in the URL — it is sent as the first message
    on the WebSocket. The browser reaches the backend on the same host it
    used for REST, so the orchestrator's internal address is never leaked.
    """
    host = request.headers.get("host", "localhost:8000")
    scheme = "wss" if request.url.scheme == "https" else "ws"
    return f"{scheme}://{host}/api/v1/labs/ws/lab"


def _extract_auth_token(message: dict) -> str | None:
    """Pull the JWT out of the first WS message ({'type': 'auth', 'token': ...})."""
    if message.get("type") != "websocket.receive":
        return None
    text = message.get("text")
    if text is None:
        raw = message.get("bytes")
        if raw is None:
            return None
        text = raw.decode(errors="replace")
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    token = data.get("token")
    return token if isinstance(token, str) and token else None


async def _get_orchestrator_session_by_key(user_id: str, lab_id: str) -> dict | None:
    """Ask the orchestrator for the live session for this user+lab.

    The orchestrator queries Docker labels, so this works even after this
    process or the orchestrator restarted (no reliance on in-memory state).
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                f"{ORCHESTRATOR_URL}/labs/by_key",
                params={"user_id": user_id, "lab_id": lab_id},
            )
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    data = resp.json()
    return {
        "session_id": data["session_id"],
        "container_name": data.get("container_name", ""),
        "status": data.get("status", ""),
    }


async def _require_active_session(user_id: str, course_id: str, lab_id: str) -> dict:
    """Return the live session for this user+lab, or 404.

    Checks the local cache first, then falls back to the orchestrator's
    label-based lookup (read-through cache).
    """
    key = _session_key(user_id, course_id, lab_id)
    entry = active_sessions.get(key)
    if entry:
        return entry

    found = await _get_orchestrator_session_by_key(user_id, lab_id)
    if not found:
        raise HTTPException(
            status_code=404,
            detail="No active session for this lab. Start the lab first.",
        )
    active_sessions[key] = {
        "session_id": found["session_id"],
        "container_name": found["container_name"],
    }
    return found


async def _run_orchestrator_exec(session_id: str, command: str) -> tuple[int, str]:
    """Proxy an exec to the orchestrator and return (exit_code, combined output)."""
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

    data = resp.json()
    return int(data.get("exit_code", -1)), data.get("output", "")


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
    request: Request,
    firebase_data=Depends(verify_firebase_token),
):
    """Return the active session for this user+lab, or null if none exists.

    The orchestrator is the source of truth (Docker labels), so a session is
    found even after this process restarted.
    """
    user_id = firebase_data.get("uid", "")
    key = _session_key(user_id, course_id, lab_id)

    found = await _get_orchestrator_session_by_key(user_id, lab_id)
    if not found:
        active_sessions.pop(key, None)
        return None

    active_sessions[key] = {
        "session_id": found["session_id"],
        "container_name": found["container_name"],
    }

    ws_token = _generate_ws_token(found["session_id"], user_id, lab_id)

    return ActiveSessionResponse(
        session_id=found["session_id"],
        lab_id=lab_id,
        container_name=found["container_name"],
        status=found["status"],
        ws_token=ws_token,
        ws_url=_build_ws_url(request),
    )


@router.post("/courses/{course_id}/labs/{lab_id}/start")
async def start_lab(
    course_id: str,
    lab_id: str,
    request: Request,
    body: StartLabRequest,
    firebase_data=Depends(verify_firebase_token),
):
    """Provision a lab container from the client-supplied environment config.

    If a live container already exists for this user+lab, reuse it instead of
    spawning a duplicate (prevents zombie containers after a restart).
    """
    user_id = firebase_data.get("uid", "")
    key = _session_key(user_id, course_id, lab_id)

    existing = await _get_orchestrator_session_by_key(user_id, lab_id)
    if existing:
        active_sessions[key] = {
            "session_id": existing["session_id"],
            "container_name": existing["container_name"],
        }
        ws_token = _generate_ws_token(existing["session_id"], user_id, lab_id)
        return StartLabResponse(
            session_id=existing["session_id"],
            lab_id=lab_id,
            container_name=existing["container_name"],
            status=existing["status"],
            ws_token=ws_token,
            ws_url=_build_ws_url(request),
        )

    # No live container — the cached entry (if any) is stale. Best-effort
    # cleanup, then provision fresh.
    cached = active_sessions.pop(key, None)
    if cached:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await client.delete(f"{ORCHESTRATOR_URL}/labs/{cached['session_id']}")
        except Exception:
            pass

    orch_payload = {
        "lab_id": lab_id,
        "image": body.image,
        "user_id": user_id,
        "course_id": course_id,
        "apt_packages": body.apt_packages,
        "pre_pull": body.pre_pull,
        "setup": body.setup,
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

    # Track this session (read-through cache)
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
        ws_url=_build_ws_url(request),
    )


@router.post("/courses/{course_id}/labs/{lab_id}/token/{session_id}")
async def refresh_token(
    course_id: str,
    lab_id: str,
    session_id: str,
    request: Request,
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

    ws_token = _generate_ws_token(session_id, user_id, lab_id)

    return TokenResponse(ws_token=ws_token, ws_url=_build_ws_url(request))


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


@router.post("/courses/{course_id}/labs/{lab_id}/tasks")
async def get_lab_tasks(
    course_id: str,
    lab_id: str,
    body: LabTasksRequest,
    firebase_data=Depends(verify_firebase_token),
):
    """Return the lab's task list for an active session.

    The task list comes from the client (its local lab config). For dynamic
    multiple-choice tasks, the answer options are resolved by running the
    task's validation command inside the container.
    """
    user_id = firebase_data.get("uid", "")
    entry = await _require_active_session(user_id, course_id, lab_id)

    tasks = body.tasks

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
                _, output = await _run_orchestrator_exec(entry["session_id"], cmd)
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

    The validation spec (task_type, validation, error_message, hint) is
    supplied by the client from its local lab config.

    - multiple_choice: answer is checked against validation.expected_output
      (static) or against the output of validation.command (dynamic).
    - command tasks: validation.command is run as the student and its output
      is compared using match_type (exact / contains / regex / line_count).
    - file_check: validation.path must contain validation.contains.
    """
    user_id = firebase_data.get("uid", "")
    entry = await _require_active_session(user_id, course_id, lab_id)

    task_type = body.task_type
    validation = body.validation or {}

    def _result(correct: bool, output: str = "") -> JSONResponse:
        return JSONResponse(content={
            "correct": correct,
            "output": output,
            "error": None if correct else body.error_message,
            "hint": body.hint,
        })

    if task_type == "multiple_choice":
        expected = validation.get("expected_answer", validation.get("expected_output"))
        if expected is not None:
            return _result((body.answer or "").strip() == str(expected).strip())
        cmd = validation.get("command")
        if not cmd:
            return JSONResponse(status_code=501, content={
                "detail": "Dynamic multiple_choice without a validation command is not supported",
            })
        exit_code, output = await _run_orchestrator_exec(entry["session_id"], cmd)
        return _result((body.answer or "").strip() == _first_line(output), output)

    if task_type == "file_check":
        path = validation.get("path")
        contains = validation.get("contains")
        if not path or contains is None:
            return JSONResponse(status_code=501, content={
                "detail": "file_check requires validation.path and validation.contains",
            })
        _, output = await _run_orchestrator_exec(entry["session_id"], f"cat {path} 2>/dev/null")
        return _result(contains in output, output)

    if task_type == "port_check":
        cmd = validation.get("command")
        if not cmd:
            return JSONResponse(status_code=501, content={
                "detail": "port_check validation is not supported yet",
            })
        exit_code, output = await _run_orchestrator_exec(entry["session_id"], cmd)
        return _result(_match_output(output, validation), output)

    cmd = validation.get("command")
    if not cmd:
        return JSONResponse(status_code=501, content={
            "detail": f"Task type '{task_type}' requires validation.command",
        })
    exit_code, output = await _run_orchestrator_exec(entry["session_id"], cmd)
    if "expected_exit_code" in validation:
        return _result(exit_code == int(validation["expected_exit_code"]), output)
    return _result(_match_output(output, validation), output)


# The frontend sends an application-level ping every 15s while connected. If
# no browser frame arrives within this window, the tab is gone or wedged and
# the bridge should be torn down so the orchestrator can clean up its attach
# client instead of leaking it.
_BROWSER_IDLE_TIMEOUT_SECONDS = 45
# Bound a single send to a slow/blocked peer so one stuck direction can't
# freeze the whole terminal (backpressure would stall the exec stream).
_SEND_TIMEOUT_SECONDS = 15


async def _bridge(browser: WebSocket, orch) -> None:
    """Bidirectionally forward frames between the browser and the orchestrator.

    - browser -> orchestrator: binary terminal input and resize JSON frames
    - orchestrator -> browser: binary terminal output

    When either side closes, the close condition is propagated to the caller
    so the browser receives the orchestrator's close code (e.g. 4001/4003).
    Both directions are watchdogged so a silently-dead peer tears the bridge
    down instead of leaving an orphaned connection on the orchestrator.
    """

    async def browser_to_orch():
        while True:
            try:
                message = await asyncio.wait_for(
                    browser.receive(), timeout=_BROWSER_IDLE_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError:
                return
            if message.get("type") == "websocket.disconnect":
                return
            if message.get("type") != "websocket.receive":
                continue
            data = message.get("bytes")
            if data is None:
                text = message.get("text")
                if text is None:
                    continue
                data = text.encode()
            await asyncio.wait_for(orch.send(data), timeout=_SEND_TIMEOUT_SECONDS)

    async def orch_to_browser():
        async for raw in orch:
            try:
                if isinstance(raw, bytes):
                    await asyncio.wait_for(
                        browser.send_bytes(raw), timeout=_SEND_TIMEOUT_SECONDS
                    )
                else:
                    await asyncio.wait_for(
                        browser.send_text(raw), timeout=_SEND_TIMEOUT_SECONDS
                    )
            except asyncio.TimeoutError:
                return

    send_task = asyncio.create_task(browser_to_orch())
    recv_task = asyncio.create_task(orch_to_browser())

    done, pending = await asyncio.wait(
        [send_task, recv_task],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()

    # Propagate the first task exception (e.g. ConnectionClosed carrying the
    # orchestrator's close code) so the proxy handler can forward it.
    for task in done:
        try:
            exc = task.exception()
        except asyncio.CancelledError:
            continue
        if exc is not None:
            raise exc


@router.websocket("/ws/lab")
async def lab_terminal_ws(websocket: WebSocket):
    """Proxy the browser terminal WebSocket to the orchestrator.

    The browser connects to the backend (never the orchestrator). The JWT is
    sent as the first message — a {"type": "auth", "token": ...} handshake —
    and is validated here before an internal client connection is opened to
    the orchestrator. Terminal input/output and resize frames are bridged
    transparently, so tmux persistence and resize handling are unchanged.
    """
    await websocket.accept()

    try:
        message = await websocket.receive()
    except WebSocketDisconnect:
        return

    token = _extract_auth_token(message)
    if not token or not _verify_ws_token(token):
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    try:
        async with websockets.connect(f"{WS_ORCHESTRATOR_URL}/ws/terminal") as orch:
            await orch.send(json.dumps({"type": "auth", "token": token}))
            await _bridge(websocket, orch)
    except WebSocketDisconnect:
        return
    except websockets.exceptions.ConnectionClosed as e:
        try:
            await websocket.close(code=e.code or 1011, reason=(e.reason or "Closed")[:120])
        except Exception:
            pass
    except Exception:
        logger.exception("Terminal proxy error")
        try:
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass
