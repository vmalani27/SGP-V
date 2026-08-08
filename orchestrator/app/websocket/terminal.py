"""
WebSocket terminal — tmux-based with JWT authentication.

The browser never talks to the orchestrator directly. The backend proxies the
terminal WebSocket and sends the JWT as the FIRST message (a `{"type": "auth",
"token": ...}` handshake) — never as a URL query parameter. The orchestrator
validates it on connect, resolves the container from the session, and attaches
to a tmux session.

On disconnect: tmux keeps running, container alive (40-min timeout).
On reconnect: tmux reattaches with full scrollback preserved.

Every connection attaches its own `tmux attach-session` client. Closing the
docker exec stream does NOT terminate the exec process (verified: the daemon
leaves the process running as an orphan), so each client writes its container
namespace PID to a per-connection pidfile and the handler kills it on teardown.
Without this, leaked clients accumulate and a wedged client can freeze the
whole tmux session (input + output stop, no logs anywhere).
"""

import asyncio
import json
import logging
import secrets

import aiodocker
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import JWT_ALGORITHM, JWT_SECRET
from app.api.labs import sessions

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

# The backend closes a stalled bridge after ~45s of silence and the frontend
# pings every 15s while alive, so anything idle this long is a dead client.
_IDLE_TIMEOUT_SECONDS = 60

# Bound how long a single WS send may block. A client that cannot drain output
# (frozen tab, dead network) would otherwise stall the exec stream, which
# backpressures all the way to the shell and freezes the terminal for everyone.
_SEND_TIMEOUT_SECONDS = 10


def _verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        logger.warning("WebSocket token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid WebSocket token: {e}")
        return None


async def _receive_token(websocket: WebSocket) -> str | None:
    """Read the auth handshake as the first client message."""
    try:
        message = await websocket.receive()
    except WebSocketDisconnect:
        return None

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


async def _kill_attach_client(docker: aiodocker.Docker, container, pidfile: str) -> None:
    """Kill the tmux attach client for this connection.

    The attach command writes its container namespace PID to ``pidfile``. Run
    as root (inside the container's PID namespace) so the PID resolves.
    """
    try:
        # /proc/<pid>/cmdline is NUL-separated, so translate NULs to spaces
        # before matching the command line (guards against PID reuse).
        kill_cmd = [
            "bash", "-c",
            "pid=$(cat {pf} 2>/dev/null); "
            "if [ -n \"$pid\" ]; then "
            "c=$(tr '\\0' ' ' < \"/proc/$pid/cmdline\" 2>/dev/null); "
            "case \"$c\" in *'tmux attach-session'*) kill -9 \"$pid\" 2>/dev/null;; esac; "
            "fi; "
            "rm -f {pf}".format(pf=pidfile),
        ]
        exec_obj = await container.exec(
            cmd=kill_cmd,
            stdin=False,
            stdout=False,
            stderr=False,
            user="root",
        )
        await exec_obj.start(detach=True)
    except Exception as e:
        logger.debug(f"attach client cleanup failed: {e}")


def _is_json_message(payload: bytes) -> dict | None:
    """Return a parsed JSON control message, or None if payload is raw input."""
    try:
        msg = json.loads(payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(msg, dict):
        return None
    return msg


@router.websocket("/ws/terminal")
async def terminal(websocket: WebSocket):
    await websocket.accept()

    # --- JWT handshake (first message, never in the URL) ---
    token = await _receive_token(websocket)
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    claims = _verify_token(token)
    if not claims:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    # Resolve the container from the session — no container name in the URL.
    session_id = claims.get("session_id")
    session = sessions.get(session_id)
    if not session or not session.container_name:
        await websocket.close(code=4003, reason="Session mismatch")
        return

    container_name = session.container_name

    docker = aiodocker.Docker()
    pidfile = f"/tmp/.tmux_attach_{secrets.token_hex(6)}.pid"
    try:
        container = await docker.containers.get(container_name)

        # Atomically create-or-attach: tries creating a new detached session
        # (fails silently if one already exists), then attaches regardless.
        # This avoids a race where two connections both check _tmux_exists
        # before either creates the session. The PID is recorded so the attach
        # client can be killed on teardown — closing the exec stream does not
        # terminate the process. Mouse mode is enabled so the frontend's wheel
        # scrolls tmux's scrollback history (xterm's own buffer only holds what
        # was rendered in the current tab session, not the full tmux history).
        attach_cmd = [
            "bash", "-c",
            f"echo $$ > {pidfile}; "
            "tmux new-session -d -s lab '/bin/bash -l' 2>/dev/null; "
            "tmux set-option -g mouse on 2>/dev/null; "
            "tmux set-option -g history-limit 5000 2>/dev/null; "
            "tmux set-option -s set-clipboard on 2>/dev/null; "
            "exec tmux attach-session -t lab",
        ]

        exec_obj = await container.exec(
            cmd=attach_cmd,
            stdin=True,
            stdout=True,
            stderr=True,
            tty=True,
            user="student",
        )
        stream = exec_obj.start(detach=False)

        try:
            async with stream:

                async def ws_to_exec():
                    try:
                        while True:
                            # Idle watchdog: the frontend pings every 15s while
                            # alive, so silence past the timeout is a dead peer.
                            message = await asyncio.wait_for(
                                websocket.receive(), timeout=_IDLE_TIMEOUT_SECONDS
                            )
                            if message.get("type") == "websocket.disconnect":
                                logger.info(
                                    f"WebSocket disconnected for '{container_name}'"
                                )
                                return
                            if message.get("type") != "websocket.receive":
                                continue
                            payload = message.get("bytes")
                            if payload is None:
                                text = message.get("text")
                                if text is None:
                                    continue
                                payload = text.encode()
                            msg = _is_json_message(payload)
                            if msg is not None:
                                mtype = msg.get("type")
                                if mtype == "resize":
                                    try:
                                        cols = int(msg["cols"])
                                        rows = int(msg["rows"])
                                    except (KeyError, TypeError, ValueError):
                                        continue
                                    try:
                                        await exec_obj.resize(h=rows, w=cols)
                                    except Exception as e:
                                        logger.debug(f"exec PTY resize failed: {e}")
                                    continue
                                if mtype in ("ping", "pong"):
                                    # Application-level liveness. Reply to pings
                                    # so the frontend can distinguish a live but
                                    # idle shell from a wedged connection.
                                    if mtype == "ping":
                                        try:
                                            await websocket.send_json(
                                                {"type": "pong"}
                                            )
                                        except Exception:
                                            pass
                                    continue
                            await stream.write_in(payload)
                    except asyncio.TimeoutError:
                        logger.info(
                            f"WebSocket idle timeout for '{container_name}'"
                        )
                    except WebSocketDisconnect:
                        logger.info(f"WebSocket disconnected for '{container_name}'")
                    except Exception as e:
                        logger.debug(f"ws_to_exec ended: {e}")

                async def exec_to_ws():
                    try:
                        while True:
                            msg = await stream.read_out()
                            if msg is None:
                                break
                            # A client that cannot drain output must not stall
                            # the exec stream (and therefore the whole tmux).
                            await asyncio.wait_for(
                                websocket.send_bytes(msg.data),
                                timeout=_SEND_TIMEOUT_SECONDS,
                            )
                    except asyncio.TimeoutError:
                        logger.info(
                            f"Terminal send stalled for '{container_name}', "
                            "dropping connection"
                        )
                    except WebSocketDisconnect:
                        logger.info(
                            f"WebSocket disconnected for '{container_name}'"
                        )
                    except Exception as e:
                        logger.info(
                            f"Terminal output stream ended for "
                            f"'{container_name}': {e}"
                        )

                send_task = asyncio.create_task(ws_to_exec())
                recv_task = asyncio.create_task(exec_to_ws())

                done, pending = await asyncio.wait(
                    [send_task, recv_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for task in pending:
                    task.cancel()
        finally:
            await _kill_attach_client(docker, container, pidfile)

    except Exception as e:
        logger.error(f"Terminal error for '{container_name}': {e}")
        try:
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass
    finally:
        await docker.close()
