"""
Demos API — backend proxy for disposable chapter demonstrations.

The frontend renders the :::demo directive locally (it is part of the
downloaded chapter content) and calls this API to run predefined steps
against an ephemeral demo container. The backend only forwards to the
orchestrator; it keeps no session state because demo containers are
addressable by Docker labels (user_id + demo_id) on the orchestrator.

This system is deliberately separate from labs: no task validation, no
progress tracking, no student user — the demo environment is disposable.
"""

import asyncio
import json
import logging

import httpx
import jwt
import websockets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.config import JWT_ALGORITHM, JWT_EXPIRY_MINUTES, JWT_SECRET, ORCHESTRATOR_URL, WS_ORCHESTRATOR_URL
from app.routers.labs import _bridge, _extract_auth_token, _verify_ws_token
from app.utils.firebase_util import verify_firebase_token

logger = logging.getLogger("backend.demos")

router = APIRouter(prefix="/api/v1/demos", tags=["demos"])


class EnsureDemoRequest(BaseModel):
    demo_id: str
    image: str = "sgp-lab-docker:latest"
    pre_pull: list[str] = []


class ExecDemoRequest(BaseModel):
    command: str
    user: str = "root"


async def _proxy(client: httpx.AsyncClient, method: str, path: str, **kwargs):
    try:
        resp = await client.request(method, f"{ORCHESTRATOR_URL}/demos{path}", **kwargs)
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Cannot connect to orchestrator")
    if resp.status_code >= 400:
        detail = resp.json().get("detail", resp.text)
        raise HTTPException(status_code=resp.status_code, detail=detail)
    return resp.json()


def _generate_demo_ws_token(demo_id: str, user_id: str) -> str:
    """Mint a short-lived WebSocket token for a demo terminal.

    Carries kind=demo + demo_id + user_id. The orchestrator resolves the demo
    container by those labels — no container name ever appears in a URL.
    """
    payload = {
        "kind": "demo",
        "demo_id": demo_id,
        "user_id": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRY_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _build_demo_ws_url(request: Request) -> str:
    """Browser-facing WebSocket URL on the backend itself (token in handshake)."""
    host = request.headers.get("host", "localhost:8000")
    scheme = "wss" if request.url.scheme == "https" else "ws"
    return f"{scheme}://{host}/api/v1/demos/ws/demo"


@router.post("/{demo_id}/ensure")
async def ensure_demo(
    demo_id: str,
    body: EnsureDemoRequest,
    request: Request,
    firebase_data=Depends(verify_firebase_token),
):
    """Create (or re-attach to) the demo container for this user+demo.

    If a live container already exists (label-based lookup), reuse it instead
    of spawning a duplicate. Otherwise provision a fresh disposable one.
    """
    user_id = firebase_data.get("uid", "")
    ws_token = _generate_demo_ws_token(demo_id, user_id)
    ws_url = _build_demo_ws_url(request)

    async with httpx.AsyncClient(timeout=90.0) as client:
        # Re-attach if a live container exists for this user+demo.
        try:
            existing = await _proxy(
                client,
                "GET",
                "/by_key",
                params={"user_id": user_id, "demo_id": demo_id},
            )
            return {
                "name": existing["name"],
                "status": "running",
                "reused": True,
                "ws_token": ws_token,
                "ws_url": ws_url,
            }
        except HTTPException as e:
            if e.status_code != 404:
                raise

        created = await _proxy(
            client,
            "POST",
            "",
            json={
                "demo_id": demo_id,
                "image": body.image,
                "user_id": user_id,
                "pre_pull": body.pre_pull,
            },
        )
        return {
            "name": created["name"],
            "status": created["status"],
            "reused": False,
            "ws_token": ws_token,
            "ws_url": ws_url,
        }


@router.post("/{demo_id}/exec")
async def exec_demo(
    demo_id: str,
    body: ExecDemoRequest,
    request: Request,
    firebase_data=Depends(verify_firebase_token),
):
    """Run a single predefined command in the demo container."""
    user_id = firebase_data.get("uid", "")

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            demo = await _proxy(
                client,
                "GET",
                "/by_key",
                params={"user_id": user_id, "demo_id": demo_id},
            )
        except HTTPException as e:
            if e.status_code == 404:
                raise HTTPException(
                    status_code=409,
                    detail="No demo container. Call /ensure first.",
                )
            raise

        result = await _proxy(
            client,
            "POST",
            f"/{demo['name']}/exec",
            json={"command": body.command, "user": body.user},
        )
        return result


@router.post("/{demo_id}/reset")
async def reset_demo(
    demo_id: str,
    request: Request,
    firebase_data=Depends(verify_firebase_token),
):
    """Destroy the demo container so the next ensure starts fresh."""
    user_id = firebase_data.get("uid", "")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            demo = await _proxy(
                client,
                "GET",
                "/by_key",
                params={"user_id": user_id, "demo_id": demo_id},
            )
        except HTTPException as e:
            if e.status_code == 404:
                return {"status": "already-destroyed"}
            raise
        await _proxy(client, "DELETE", f"/{demo['name']}")
    return {"status": "destroyed"}


@router.delete("/{demo_id}")
async def destroy_demo(
    demo_id: str,
    request: Request,
    firebase_data=Depends(verify_firebase_token),
):
    """Destroy the demo container (cleanup when the learner leaves the slide)."""
    return await reset_demo(demo_id, request, firebase_data)


@router.websocket("/ws/demo")
async def demo_terminal_ws(websocket: WebSocket):
    """Proxy the browser's demo terminal WebSocket to the orchestrator.

    Identical to the lab terminal bridge, but the token carries kind=demo +
    demo_id + user_id so the orchestrator attaches to the label-addressed demo
    container (never the learner's lab container).
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
        logger.exception("Demo terminal proxy error")
        try:
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass