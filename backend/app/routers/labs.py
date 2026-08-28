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
from app.core.firestore_db import db
from app.utils.firebase_util import verify_firebase_token

logger = logging.getLogger("backend.labs")

router = APIRouter(prefix="/api/v1/labs", tags=["labs"])

# Read-through cache of active sessions per user per lab.
# Key: f"{user_id}:{course_id}:{lab_id}"  Value: session info dict
# Source of truth is the orchestrator (Docker labels via /labs/by_key).
active_sessions: dict[str, dict] = {}

# Per-session values recorded from successful task validations, so a later
# task can compare against them (e.g. "the recreated container has a new ID").
# Key: f"{user_id}:{course_id}:{lab_id}"  Value: {record_key: value}
task_memory: dict[str, dict[str, str]] = {}


def _session_key(user_id: str, course_id: str, lab_id: str) -> str:
    return f"{user_id}:{course_id}:{lab_id}"


class ActiveSessionResponse(BaseModel):
    session_id: str
    lab_id: str
    container_name: str
    status: str
    ws_token: str
    ws_url: str
    expires_at: datetime | None = None
    remaining_seconds: int | None = None


class StartLabResponse(BaseModel):
    session_id: str
    lab_id: str
    container_name: str
    status: str
    ws_token: str
    ws_url: str
    expires_at: datetime | None = None
    remaining_seconds: int | None = None


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
        "expires_at": data.get("expires_at"),
        "remaining_seconds": data.get("remaining_seconds"),
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


def _execution_user(validation: dict) -> str:
    """Resolve which container user a validation command runs as.

    A task's validation block may declare ``execution_user`` (e.g. ``sudo``
    for docker-admin tasks). Those are mapped to ``root`` here (the elevated
    user every lab image ships); anything else falls back to ``student`` so a
    validation never hits ``exec: <user>: no such user``. The orchestrator
    passes this straight through as docker's ``--user`` flag.
    """
    if not isinstance(validation, dict):
        return "student"
    value = validation.get("execution_user")
    if isinstance(value, str) and value.strip():
        return "root" if value.strip().lower() in ("sudo", "root") else "student"
    return "student"


async def _run_orchestrator_exec(session_id: str, command: str, user: str = "student") -> tuple[int, str]:
    """Proxy an exec to the orchestrator and return (exit_code, combined output)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{ORCHESTRATOR_URL}/labs/{session_id}/exec",
                json={"command": command, "user": user},
            )
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")

    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    data = resp.json()
    return int(data.get("exit_code", -1)), data.get("output", "")


async def _apply_lab_setup(session_id: str, setup: list[dict]) -> None:
    """Re-apply a lab's setup commands to an existing (reused) container.

    Fresh provisioning runs setup in the orchestrator, but the start-lab reuse
    path skips it — so a container that predates a setup fix, or one that
    crashed between container-start and setup, would keep its broken state on
    every reuse. Re-running is safe for the idempotent commands used today
    (e.g. ``usermod -aG docker student``). Failures are logged, never fatal:
    the session remains usable, and the next successful start retries.
    """
    for step in setup or []:
        command = step.get("command") if isinstance(step, dict) else None
        if not isinstance(command, str) or not command.strip():
            continue
        try:
            exit_code, output = await _run_orchestrator_exec(session_id, command, user="root")
            if exit_code != 0:
                logger.warning(
                    "Reapplying setup '%s' on '%s' failed (exit %s): %s",
                    command, session_id, exit_code, output,
                )
        except HTTPException as e:
            logger.warning(
                "Failed to reapply setup '%s' on '%s': %s", command, session_id, e
            )


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


def _substitute_recorded(command: str, memory: dict[str, str]) -> str:
    """Replace `{{recorded:KEY}}` placeholders with values stored from an
    earlier successful task validation.

    Raises KeyError if a referenced key has not been recorded yet — the
    calling route turns that into a 409 so the student knows to complete the
    recording task first.
    """
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        if key not in memory:
            raise KeyError(f"Recorded value '{key}' is not set yet")
        return memory[key]

    return re.sub(r"\{\{recorded:([A-Za-z0-9_]+)\}\}", _replace, command)


def _substitute_session(command: str, session_id: str) -> str:
    """Replace `{{session_id}}` with the learner's live tmux session.

    Lets an authored validation inspect the learner's actual terminal (e.g.
    ``tmux capture-pane -pt {{session_id}}``) so an action-gated task only
    passes when the learner performed the action themselves — the checker can
    never grant credit by executing the very thing the task asks for.
    """
    return command.replace("{{session_id}}", session_id)


def _build_options(correct: str) -> list[str]:
    """Build a small option set around the correct answer for dynamic MC tasks."""
    correct = _first_line(correct)
    try:
        n = int(correct)
        start = max(0, n - 2)
        return [str(i) for i in range(start, n + 3)]
    except ValueError:
        return [correct, "Yes", "No"]


def _resolve_module_id(course_id: str, lab_id: str) -> str | None:
    """Find the module containing this lab from the worker-seeded course doc.

    Task results mirror the labsProgress shape ({moduleId: {labId: ...}}),
    which needs the module id. The backend still reads no content files —
    the Firestore course document is the lookup source.
    """
    try:
        doc = db.collection("courses").document(course_id).get()
        if not doc.exists:
            return None
        for module in doc.to_dict().get("modules") or []:
            if any(lab.get("id") == lab_id for lab in module.get("labs") or []):
                return module.get("id")
    except Exception:
        logger.exception("Failed to resolve module for %s/%s", course_id, lab_id)
    return None


def _record_task_result(
    user_id: str, course_id: str, lab_id: str, task_id: str, passed: bool
) -> None:
    """Persist one validation outcome into the enrollment document (best-effort).

    Shape mirrors labsProgress: taskResults.{moduleId}.{labId}.{taskId} =
    {attempts, passed, firstPassedAt?, lastAttemptAt}. ``passed`` is sticky so
    a later broken container state can't erase a completion; ``attempts``
    counts every check so an instructor can see struggle. Never raises — a
    recording failure must not turn a correct answer into an error.
    """
    try:
        module_id = _resolve_module_id(course_id, lab_id)
        if not module_id:
            logger.warning(
                "No module found for lab %s in course %s; task result not recorded",
                lab_id, course_id,
            )
            return

        ref = db.collection("enrollments").document(f"{user_id}_{course_id}")
        snap = ref.get()
        if not snap.exists:
            logger.debug(
                "No enrollment for %s in %s; task result not recorded", user_id, course_id
            )
            return

        data = snap.to_dict()
        results = data.get("taskResults") or {}
        prev = ((results.get(module_id) or {}).get(lab_id) or {}).get(task_id) or {}

        now = datetime.now(timezone.utc)
        ever_passed = bool(prev.get("passed")) or passed
        record = {
            "attempts": int(prev.get("attempts") or 0) + 1,
            "passed": ever_passed,
            "lastAttemptAt": now,
        }
        if ever_passed:
            record["firstPassedAt"] = prev.get("firstPassedAt") or now

        results.setdefault(module_id, {}).setdefault(lab_id, {})[task_id] = record
        ref.update({
            "taskResults": results,
            "lastAccessed": now,
        })
    except Exception:
        logger.exception(
            "Failed to record task result for %s/%s/%s", user_id, course_id, lab_id
        )


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
        expires_at=found.get("expires_at"),
        remaining_seconds=found.get("remaining_seconds"),
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
        # A reused container may predate a working provisioning (stale grant,
        # interrupted setup) — re-apply setup so it never stays broken.
        await _apply_lab_setup(existing["session_id"], body.setup)
        ws_token = _generate_ws_token(existing["session_id"], user_id, lab_id)
        return StartLabResponse(
            session_id=existing["session_id"],
            lab_id=lab_id,
            container_name=existing["container_name"],
            status=existing["status"],
            ws_token=ws_token,
            ws_url=_build_ws_url(request),
            expires_at=existing.get("expires_at"),
            remaining_seconds=existing.get("remaining_seconds"),
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
        expires_at=data.get("expires_at"),
        remaining_seconds=data.get("remaining_seconds"),
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

    # Clean up session tracking + any recorded task values so a fresh lab
    # session does not inherit stale state (e.g. an old {{recorded:web_id}}).
    user_id = firebase_data.get("uid", "")
    key = _session_key(user_id, course_id, lab_id)
    active_sessions.pop(key, None)
    task_memory.pop(key, None)

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
                _, output = await _run_orchestrator_exec(entry["session_id"], cmd, user=_execution_user(task.get("validation", {})))
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

    mem_key = _session_key(user_id, course_id, lab_id)
    memory = task_memory.setdefault(mem_key, {})

    def _result(correct: bool, output: str = "") -> JSONResponse:
        # Every validation branch (multiple_choice / file_check / port_check /
        # terminal) funnels through here, so this is the one place a check is
        # counted. Infrastructure failures raise before reaching it, so they
        # never pollute the student's attempt history.
        _record_task_result(user_id, course_id, lab_id, body.task_id, correct)
        return JSONResponse(content={
            "correct": correct,
            "output": output,
            "error": None if correct else body.error_message,
            "hint": body.hint,
        })

    async def _run(cmd: str, user: str) -> tuple[int, str]:
        cmd = _substitute_session(cmd, entry["session_id"])
        try:
            cmd = _substitute_recorded(cmd, memory)
        except KeyError as e:
            raise HTTPException(status_code=409, detail=f"{e} Complete the task that records it first.")
        return await _run_orchestrator_exec(entry["session_id"], cmd, user=user)

    async def _record_after_success(user: str) -> None:
        rec = validation.get("record")
        if not isinstance(rec, dict) or not rec.get("key"):
            return
        rec_cmd = rec.get("command")
        if not isinstance(rec_cmd, str) or not rec_cmd.strip():
            return
        rec_cmd = _substitute_session(rec_cmd, entry["session_id"])
        try:
            rec_cmd = _substitute_recorded(rec_cmd, memory)
        except KeyError:
            return
        _, output = await _run_orchestrator_exec(entry["session_id"], rec_cmd, user=user)
        memory[str(rec["key"])] = output.strip()

    if task_type == "multiple_choice":
        expected = validation.get("expected_answer", validation.get("expected_output"))
        if expected is not None:
            return _result((body.answer or "").strip() == str(expected).strip())
        cmd = validation.get("command")
        if not cmd:
            return JSONResponse(status_code=501, content={
                "detail": "Dynamic multiple_choice without a validation command is not supported",
            })
        exit_code, output = await _run(cmd, _execution_user(validation))
        return _result((body.answer or "").strip() == _first_line(output), output)

    if task_type == "file_check":
        path = validation.get("path")
        contains = validation.get("contains")
        if not path or contains is None:
            return JSONResponse(status_code=501, content={
                "detail": "file_check requires validation.path and validation.contains",
            })
        _, output = await _run(f"cat {path} 2>/dev/null", _execution_user(validation))
        return _result(contains in output, output)

    if task_type == "port_check":
        cmd = validation.get("command")
        if not cmd:
            return JSONResponse(status_code=501, content={
                "detail": "port_check validation is not supported yet",
            })
        exit_code, output = await _run(cmd, _execution_user(validation))
        return _result(_match_output(output, validation), output)

    cmd = validation.get("command")
    if not cmd:
        return JSONResponse(status_code=501, content={
            "detail": f"Task type '{task_type}' requires validation.command",
        })
    exec_user = _execution_user(validation)
    exit_code, output = await _run(cmd, exec_user)
    if "expected_exit_code" in validation:
        correct = exit_code == int(validation["expected_exit_code"])
    else:
        correct = _match_output(output, validation)
    if correct:
        await _record_after_success(exec_user)
    return _result(correct, output)


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
