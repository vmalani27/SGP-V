"""
WebSocket terminal — tmux-based with JWT authentication.

The browser never talks to the orchestrator directly. The backend proxies the
terminal WebSocket and sends the JWT as the FIRST message (a `{"type": "auth",
"token": ...}` handshake) — never as a URL query parameter. The orchestrator
validates it on connect, resolves the container, and attaches to a tmux
session.

The token claims select how the container is resolved:
- kind="lab"  (default): a session_id that indexes the in-memory sessions dict.
- kind="demo": a demo_id + user_id, resolved by Docker labels so the same
  disposable demo container is reused across a chapter (and across restarts).

On disconnect: tmux keeps running, container alive (40-min lab / 30-min demo
timeout). On reconnect: tmux reattaches with full scrollback preserved. Demo
sessions are created-if-missing (never killed on reattach) so scrollback and
shell history survive slide navigation within a chapter.

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


def _resolve_container_name(claims: dict) -> tuple[str, str] | None:
    """Resolve which container and tmux session a token claim targets.

    Returns (container_name, tmux_session). ``kind="demo"`` containers are
    resolved by Docker labels (user_id + demo_id) — the same label lookup the
    backend uses — so a demo terminal survives restarts and reuses the demo
    container across a chapter. Anything else (default) is a lab session_id.
    """
    kind = claims.get("kind", "lab")
    if kind == "demo":
        from app.config import LABEL_DEMO_ID, LABEL_USER_ID
        from app.services.docker_service import DockerService

        demo_id = claims.get("demo_id")
        user_id = claims.get("user_id")
        if not demo_id:
            return None
        containers = DockerService().get_labs_by_labels({
            LABEL_USER_ID: user_id or "",
            LABEL_DEMO_ID: demo_id,
        })
        if not containers:
            return None
        containers.sort(key=lambda c: c.get("created", ""), reverse=True)
        return containers[0]["name"], "demo"

    session_id = claims.get("session_id")
    session = sessions.get(session_id)
    if not session or not session.container_name:
        return None
    return session.container_name, "lab"


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

    # Resolve the container from the token claims — no container name in the URL.
    resolved = _resolve_container_name(claims)
    if not resolved:
        await websocket.close(code=4003, reason="Session mismatch")
        return

    container_name, tmux_session = resolved
    kind = claims.get("kind", "lab")

    docker = aiodocker.Docker()
    pidfile = f"/tmp/.tmux_attach_{secrets.token_hex(6)}.pid"
    try:
        container = await docker.containers.get(container_name)

        # Ensure the target container is running before attempting an exec.
        try:
            info = await container.show()
            state = info.get("State", {}) or {}
            # Some Docker APIs return a boolean 'Running', others a 'Status' string.
            is_running = state.get("Running") or (state.get("Status") == "running")
            if not is_running:
                cid = info.get("Id", "")
                logger.error(
                    f"Terminal error for '{container_name}': container {cid} is not running"
                )
                try:
                    await websocket.close(code=4009, reason="Container not running")
                except Exception:
                    pass
                return
        except Exception as e:
            logger.debug(f"Failed to inspect container '{container_name}': {e}")

        # Atomically create-or-attach: tries creating a new detached session
        # (fails silently if one already exists), then attaches regardless.
        # This avoids a race where two connections both check _tmux_exists
        # before either creates the session. The PID is recorded so the attach
        # client can be killed on teardown — closing the exec stream does not
        # terminate the process. Mouse mode is enabled so the frontend's wheel
        # scrolls tmux's scrollback history (xterm's own buffer only holds what
        # was rendered in the current tab session, not the full tmux history).
        # docker exec -u student does NOT recompute supplementary groups, so a
        # student never sees a runtime docker group (usermod -aG docker during
        # lab setup). Start the exec as ROOT and drop to student via sudo, which
        # runs initgroups() on setuid. Verified live: docker exec -u student
        # lacks the docker group; `sudo -u student id` includes it.
        #
        # Demo sessions are created-if-missing (no kill on reattach) so shell
        # history and scrollback survive slide navigation within a chapter.
        session_cmd = (
            f"tmux has-session -t {tmux_session} 2>/dev/null "
            f"|| tmux new-session -d -s {tmux_session} \"bash -l\" 2>/dev/null; "
        ) if kind == "demo" else (
            f"tmux has-session -t {tmux_session} 2>/dev/null "
            f"&& tmux kill-session -t {tmux_session} 2>/dev/null || true; "
            f"tmux new-session -d -s {tmux_session} \"bash -l\" 2>/dev/null || true; "
        )
        attach_cmd = [
            "bash", "-c",
            f"sudo -u student bash -c 'echo $$ > {pidfile}; "
            f"{session_cmd}"
            f"tmux set-option -g mouse on 2>/dev/null; "
            f"tmux set-option -g history-limit 5000 2>/dev/null; "
            f"tmux set-option -s set-clipboard on 2>/dev/null; "
            f"exec tmux attach-session -t {tmux_session}'",
        ]

        exec_obj = await container.exec(
            cmd=attach_cmd,
            stdin=True,
            stdout=True,
            stderr=True,
            tty=True,
            user="root",
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
