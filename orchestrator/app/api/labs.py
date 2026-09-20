import json
import threading
import logging

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import LAB_PREFIX, LABEL_LAB_ID, LABEL_USER_ID, LABEL_COURSE_ID
from app.models.session import LabSession, LabStatus, parse_created_at
from app.services.docker_service import DockerService, get_docker_service, lab_id_to_number
from app.utils.auth import verify_orchestrator_secret


SCHEMA_HELP = {
    "schema_url": "/schemas/yaml",
    "sample_url": "/schemas/sample",
    "help": "If your lab.yaml has errors, download the sample from /schemas/sample for reference.",
}

router = APIRouter(prefix="/labs", tags=["labs"])

sessions: dict[str, LabSession] = {}

# Per-(user_id, lab_id) mutexes so a burst of concurrent lab starts collapses
# into one Sysbox container spawn. Without this, concurrent requests all pass
# the by_key -> "no live container" check before the first container registers
# its labels and each triggers a redundant `docker run`. Mirrors the demo
# create lock in api/demos.py.
_start_locks: dict[str, threading.Lock] = {}
_start_locks_guard = threading.Lock()


def _start_lock_for(user_id: str, lab_id: str) -> threading.Lock:
    key = f"{user_id}:{lab_id}"
    with _start_locks_guard:
        lock = _start_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _start_locks[key] = lock
        return lock


class StartLabRequest(BaseModel):
    lab_id: str
    image: str
    user_id: str = ""
    course_id: str = ""
    apt_packages: list[str] = []
    pre_pull: list[str] = []
    setup: list[dict[str, str]] = []


def _session_from_container(c: dict) -> LabSession | None:
    """Reconstruct a LabSession from a Docker container (label-based recovery)."""
    name = c.get("name", "")
    if not name.startswith(LAB_PREFIX + "-"):
        return None

    labels = c.get("labels") or {}
    session_id = name[len(LAB_PREFIX) + 1:]
    docker_status = c.get("status", "")
    status = LabStatus.RUNNING if docker_status == "running" else LabStatus.STOPPED

    return LabSession(
        session_id=session_id,
        lab_type="custom",
        lab_id=labels.get(LABEL_LAB_ID, ""),
        user_id=labels.get(LABEL_USER_ID, ""),
        container_id=c.get("id"),
        container_name=name,
        status=status,
        created_at=parse_created_at(c.get("created")),
    )


class ActivateLabRequest(BaseModel):
    lab_id: str


class InspectRequest(BaseModel):
    path: str
    check: str


class ExecRequest(BaseModel):
    command: str
    user: str = "student"


@router.post("", dependencies=[Depends(verify_orchestrator_secret)])
def start_lab(req: StartLabRequest, docker_svc: DockerService = Depends(get_docker_service)):
    lab_number = lab_id_to_number(req.lab_id)

    labels = {
        LABEL_USER_ID: req.user_id,
        LABEL_COURSE_ID: req.course_id,
        LABEL_LAB_ID: req.lab_id,
    }

    from app.config import MAX_CONCURRENT_LABS
    from app.utils.locks import global_provisioning_lock

    with global_provisioning_lock:
        # Re-check after acquiring the lock
        existing = docker_svc.get_running_lab_by_labels({
            LABEL_USER_ID: req.user_id,
            LABEL_LAB_ID: req.lab_id,
        })
        if existing:
            session = _session_from_container(existing)
            if session:
                sessions[session.session_id] = session
                logger.info(
                    f"Lab '{req.lab_id}' reused existing container "
                    f"'{session.container_name}'"
                )
                return session

        # Auto-teardown old labs to conserve memory
        all_running = docker_svc.list_labs()
        if len(all_running) >= MAX_CONCURRENT_LABS:
            logger.info(f"Global limit reached ({len(all_running)} >= {MAX_CONCURRENT_LABS}). Tearing down old labs.")
            for c in all_running:
                try:
                    docker_svc.destroy_lab(c["name"])
                except Exception as e:
                    logger.error(f"Failed to auto-destroy old lab {c['name']}: {e}")

        session = LabSession(lab_type="custom", lab_id=req.lab_id, user_id=req.user_id)
        session.container_name = f"{LAB_PREFIX}-{session.session_id}"

        try:
            logger.info(f"Issuing synchronous docker run command for {session.container_name}... (this may block depending on host performance)")
            info = docker_svc.start_lab(req.image, session.container_name, labels=labels)
            session.container_id = info["id"]
            session.status = LabStatus.RUNNING
        except (RuntimeError, ValueError) as e:
            session.status = LabStatus.ERROR
            sessions[session.session_id] = session
            return JSONResponse(status_code=500, content={
                "detail": str(e),
                **SCHEMA_HELP,
            })

        try:
            if req.pre_pull:
                docker_svc.wait_for_docker(session.container_name)
                docker_svc.pre_pull_images(session.container_name, req.pre_pull)
            elif req.setup:
                # If container has docker CLI, wait for daemon before running setup commands
                code, _ = docker_svc.exec_command(session.container_name, ["which", "docker"], user="root")
                if code == 0:
                    docker_svc.wait_for_docker(session.container_name)

            for setup_cmd in req.setup:
                exit_code, output = docker_svc.exec_command(
                    session.container_name,
                    ["/bin/bash", "-c", setup_cmd["command"]],
                    user="root",
                )
                if exit_code != 0:
                    raise RuntimeError(
                        f"Setup command failed (exit {exit_code}): {setup_cmd['command']}: {output}"
                    )
            docker_svc.activate_lab(session.container_name, lab_number)
        except RuntimeError as e:
            session.status = LabStatus.ERROR
            sessions[session.session_id] = session
            return JSONResponse(status_code=500, content={
                "detail": str(e),
                **SCHEMA_HELP,
            })

        # Ensure container has stabilized and pre-initialize tmux session
        try:
            for _ in range(25):
                code, _ = docker_svc.exec_command(session.container_name, ["id", "-u", "student"], user="root")
                if code == 0:
                    break
                time.sleep(0.2)
            docker_svc.exec_command(
                session.container_name,
                ["sudo", "-H", "-u", "student", "tmux", "new-session", "-d", "-s", "lab", "bash -l"],
                user="root",
            )
        except Exception as e:
            logger.debug(f"Pre-initialization check for '{session.container_name}': {e}")

        sessions[session.session_id] = session
        return session


@router.get("", dependencies=[Depends(verify_orchestrator_secret)])
def list_labs(docker_svc: DockerService = Depends(get_docker_service)):
    containers = docker_svc.list_labs()
    result = []
    for c in containers:
        entry = {**c}
        for sid, session in sessions.items():
            if session.container_name == c["name"]:
                entry["session_id"] = sid
                entry["lab_type"] = session.lab_type
                entry["lab_id"] = session.lab_id
                entry["status"] = session.status.value
                break
        result.append(entry)
    return {"labs": result, "active_sessions": len(sessions)}


@router.get("/by_key", dependencies=[Depends(verify_orchestrator_secret)])
def get_lab_by_key(
    user_id: str,
    lab_id: str,
    docker_svc: DockerService = Depends(get_docker_service),
):
    """Return the live session for a user+lab by querying Docker labels.

    The orchestrator is the source of truth for sessions: after a restart the
    in-memory `sessions` dict is rebuilt from labelled containers, so the
    backend can re-attach to an existing lab instead of spawning a duplicate
    (which previously left zombie containers behind).
    """
    containers = docker_svc.get_labs_by_labels({
        LABEL_USER_ID: user_id,
        LABEL_LAB_ID: lab_id,
    })
    if not containers:
        raise HTTPException(
            status_code=404,
            detail="No live container for this user and lab",
        )

    containers.sort(key=lambda c: c.get("created", ""), reverse=True)
    for c in containers:
        session = _session_from_container(c)
        if not session:
            continue
        sessions[session.session_id] = session
        return session

    raise HTTPException(
        status_code=404,
        detail="No live container for this user and lab",
    )


@router.get("/{session_id}", dependencies=[Depends(verify_orchestrator_secret)])
def get_lab(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/activate", dependencies=[Depends(verify_orchestrator_secret)])
def activate_lab(session_id: str, req: ActivateLabRequest, docker_svc: DockerService = Depends(get_docker_service)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != LabStatus.RUNNING:
        raise HTTPException(status_code=400, detail=f"Cannot activate lab: container is {session.status.value}")

    lab_number = lab_id_to_number(req.lab_id)

    try:
        docker_svc.activate_lab(session.container_name, lab_number)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    session.lab_id = req.lab_id
    return session


@router.post("/{session_id}/stop", dependencies=[Depends(verify_orchestrator_secret)])
def stop_lab(session_id: str, docker_svc: DockerService = Depends(get_docker_service)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = LabStatus.STOPPING

    try:
        docker_svc.stop_lab(session.container_name)
        session.status = LabStatus.STOPPED
    except RuntimeError as e:
        session.status = LabStatus.ERROR
        raise HTTPException(status_code=500, detail=str(e))

    return session


@router.post("/{session_id}/resume", dependencies=[Depends(verify_orchestrator_secret)])
def resume_lab(session_id: str, docker_svc: DockerService = Depends(get_docker_service)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        docker_svc.resume_lab(session.container_name)
        session.status = LabStatus.RUNNING
    except RuntimeError as e:
        session.status = LabStatus.ERROR
        raise HTTPException(status_code=500, detail=str(e))

    return session


@router.delete("/{session_id}", dependencies=[Depends(verify_orchestrator_secret)])
def destroy_lab(session_id: str, docker_svc: DockerService = Depends(get_docker_service)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        docker_svc.destroy_lab(session.container_name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    del sessions[session_id]
    return {"detail": f"Lab '{session_id}' destroyed"}


@router.post("/{session_id}/validate", dependencies=[Depends(verify_orchestrator_secret)])
def validate_lab(session_id: str, docker_svc: DockerService = Depends(get_docker_service)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    exit_code, output = docker_svc.exec_command(
        session.container_name,
        ["/bin/bash", "/usr/local/checks/validator.sh"],
        user="root",
    )

    if exit_code != 0 and not output:
        return JSONResponse(status_code=500, content={
            "detail": f"Validator failed with exit code {exit_code}",
            **SCHEMA_HELP,
        })

    try:
        result = json.loads(output)
    except json.JSONDecodeError:
        return JSONResponse(status_code=500, content={
            "detail": f"Validator returned invalid JSON: {output[:500]}",
            **SCHEMA_HELP,
        })

    return result


@router.post("/{session_id}/inspect", dependencies=[Depends(verify_orchestrator_secret)])
def inspect_file(
    session_id: str,
    request: InspectRequest,
    docker_svc: DockerService = Depends(get_docker_service),
):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    check = request.check
    path = request.path

    if check == "exists":
        exit_code, _ = docker_svc.exec_command(
            session.container_name,
            ["test", "-e", path],
            user="student",
        )
        return {"path": path, "check": check, "result": exit_code == 0}

    elif check == "permissions":
        exit_code, output = docker_svc.exec_command(
            session.container_name,
            ["stat", "-c", "%a", path],
            user="student",
        )
        return {"path": path, "check": check, "result": output if exit_code == 0 else None}

    elif check == "owner":
        exit_code, output = docker_svc.exec_command(
            session.container_name,
            ["stat", "-c", "%U:%G", path],
            user="student",
        )
        return {"path": path, "check": check, "result": output if exit_code == 0 else None}

    elif check == "contains":
        exit_code, output = docker_svc.exec_command(
            session.container_name,
            ["cat", path],
            user="student",
        )
        return {"path": path, "check": check, "result": output if exit_code == 0 else None}

    else:
        return JSONResponse(status_code=400, content={
            "detail": f"Unknown check type: {check}",
            "valid_checks": ["exists", "permissions", "owner", "contains"],
            **SCHEMA_HELP,
        })


@router.post("/{session_id}/exec", dependencies=[Depends(verify_orchestrator_secret)])
def exec_command(
    session_id: str,
    request: ExecRequest,
    docker_svc: DockerService = Depends(get_docker_service),
):
    session = sessions.get(session_id)
    if not session:
        return JSONResponse(status_code=404, content={
            "detail": "Session not found",
            **SCHEMA_HELP,
        })

    if session.status != LabStatus.RUNNING:
        return JSONResponse(status_code=400, content={
            "detail": f"Container is {session.status.value}",
            **SCHEMA_HELP,
        })

    logger.info(f"Executing command for {session_id} as {request.user}: {request.command}")
    exit_code, output = docker_svc.exec_command(
        session.container_name,
        ["/bin/bash", "-c", request.command],
        user=request.user,
    )
    logger.info(f"Command exit: {exit_code}, Output length: {len(output)}")

    return {
        "command": request.command,
        "exit_code": exit_code,
        "output": output,
    }


def _resolve_lab_container_and_ip(session_id: str, docker_svc: DockerService):
    session = sessions.get(session_id)
    container_name = f"{LAB_PREFIX}-{session_id}" if not session_id.startswith(f"{LAB_PREFIX}-") else session_id
    raw_session_id = session_id[len(LAB_PREFIX) + 1:] if session_id.startswith(f"{LAB_PREFIX}-") else session_id

    container = None
    try:
        container = docker_svc._get_container(container_name)
    except RuntimeError:
        pass

    if not container:
        containers = docker_svc.list_labs()
        for c in containers:
            if c.get("name") == container_name or c.get("id") == session_id:
                try:
                    container = docker_svc._get_container(c.get("name"))
                    break
                except RuntimeError:
                    pass

    if not container:
        raise HTTPException(status_code=404, detail=f"Lab container for session '{session_id}' not found")

    if not session:
        session = _session_from_container(docker_svc._container_info(container))
        if session:
            sessions[session.session_id] = session
        else:
            session = LabSession(
                session_id=raw_session_id,
                lab_type="custom",
                container_id=container.short_id,
                container_name=container_name,
                status=LabStatus.RUNNING if container.status == "running" else LabStatus.STOPPED,
                created_at=parse_created_at(container.attrs.get("Created")),
            )
            sessions[raw_session_id] = session

    networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
    ip = None
    for _, net_conf in networks.items():
        if net_conf.get("IPAddress"):
            ip = net_conf["IPAddress"]
            break
    if not ip:
        ip = container.attrs.get("NetworkSettings", {}).get("IPAddress")

    host_target = ip or container_name
    return session, container, host_target


@router.get("/{session_id}/ports/{port}", dependencies=[Depends(verify_orchestrator_secret)])
def check_lab_port(
    session_id: str,
    port: int,
    docker_svc: DockerService = Depends(get_docker_service),
):
    """Check if a TCP port is open and accepting connections inside the lab container."""
    import socket

    try:
        session, container, host_target = _resolve_lab_container_and_ip(session_id, docker_svc)
    except HTTPException:
        return {"open": False, "port": port}

    if container.status != "running":
        return {"open": False, "port": port}

    # Check inner docker published ports first
    try:
        exit_code, ps_ports = docker_svc.exec_command(
            session.container_name,
            ["docker", "ps", "--format", "{{.Ports}}"],
            user="root",
        )
        if exit_code == 0 and ps_ports and f":{port}->" in ps_ports:
            return {"open": True, "port": port, "container": session.container_name}
    except Exception:
        pass

    targets_to_probe = [host_target]
    if session.container_name not in targets_to_probe:
        targets_to_probe.append(session.container_name)

    is_open = False
    for target in targets_to_probe:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                if s.connect_ex((target, port)) == 0:
                    is_open = True
                    break
        except Exception:
            pass

    return {"open": is_open, "port": port, "container": session.container_name}


@router.get("/{session_id}/open-ports", dependencies=[Depends(verify_orchestrator_secret)])
def get_open_ports(
    session_id: str,
    docker_svc: DockerService = Depends(get_docker_service),
):
    """Detect and return all open TCP/HTTP listening ports inside the lab container."""
    import re
    import socket

    try:
        session, container, host_target = _resolve_lab_container_and_ip(session_id, docker_svc)
    except HTTPException:
        return {"open_ports": [], "session_id": session_id}

    if container.status != "running":
        return {"open_ports": [], "session_id": session_id}

    candidate_ports: set[int] = {80, 443, 3000, 3001, 4000, 5000, 5173, 8000, 8080, 8081, 8888, 9000, 9090, 9091}
    discovered_docker_ports: set[int] = set()

    # Discover published ports from inner docker daemon (e.g. 0.0.0.0:3000->3000/tcp)
    try:
        exit_code, ps_ports = docker_svc.exec_command(
            session.container_name,
            ["docker", "ps", "--format", "{{.Ports}}"],
            user="root",
        )
        if exit_code == 0 and ps_ports:
            for m in re.finditer(r":(\d+)->", ps_ports):
                try:
                    p = int(m.group(1))
                    if 1 <= p <= 65535:
                        discovered_docker_ports.add(p)
                        candidate_ports.add(p)
                except ValueError:
                    pass
    except Exception as e:
        logger.debug(f"Failed to inspect docker ports for {session_id}: {e}")

    # Discover additional listening ports from /proc/net/tcp and /proc/net/tcp6
    try:
        exit_code, tcp_data = docker_svc.exec_command(
            session.container_name,
            ["cat", "/proc/net/tcp", "/proc/net/tcp6"],
            user="root",
        )
        if exit_code == 0 and tcp_data:
            for line in tcp_data.splitlines():
                parts = line.strip().split()
                # Line format: sl local_address rem_address st ... (st == 0A is LISTEN)
                if len(parts) >= 4 and parts[3] == "0A":
                    local_addr = parts[1]
                    if ":" in local_addr:
                        hex_port = local_addr.split(":")[1]
                        try:
                            port_num = int(hex_port, 16)
                            # Exclude internal / system daemon ports
                            if port_num not in (22, 2375, 2376, 12000) and 1 <= port_num <= 65535:
                                candidate_ports.add(port_num)
                        except ValueError:
                            pass
    except Exception as e:
        logger.debug(f"Failed to read /proc/net/tcp for {session_id}: {e}")

    targets_to_probe = [host_target]
    if session.container_name not in targets_to_probe:
        targets_to_probe.append(session.container_name)

    open_ports_set: set[int] = set(discovered_docker_ports)
    for port in sorted(candidate_ports):
        if port in open_ports_set:
            continue
        for target in targets_to_probe:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    if s.connect_ex((target, port)) == 0:
                        open_ports_set.add(port)
                        break
            except Exception:
                pass

    open_ports = sorted(open_ports_set)
    if open_ports:
        logger.info(
            f"Detected open listening port(s) {open_ports} in lab container '{session.container_name}' (session: {session_id})"
        )

    return {"open_ports": open_ports, "session_id": session_id, "container": session.container_name}


@router.api_route("/{session_id}/proxy/{port}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
@router.api_route("/{session_id}/proxy/{port}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy_lab_port(
    session_id: str,
    port: int,
    path: str = "",
    request: Request = None,
    docker_svc: DockerService = Depends(get_docker_service),
):
    """Dynamically proxy HTTP requests to a web server running inside the lab container."""
    import asyncio
    import urllib.error
    import urllib.request
    from fastapi import Response

    session, container, host_target = _resolve_lab_container_and_ip(session_id, docker_svc)

    clean_path = path.lstrip("/") if path else ""
    target_url = f"http://{host_target}:{port}/{clean_path}"
    if request and request.url.query:
        target_url += f"?{request.url.query}"

    logger.info(
        f"Proxying {request.method if request else 'GET'} request to {target_url} for lab '{session.container_name}'"
    )

    body = await request.body() if request else None
    headers = dict(request.headers) if request else {}
    headers.pop("host", None)

    req = urllib.request.Request(
        target_url,
        data=body if body else None,
        headers=headers,
        method=request.method if request else "GET",
    )

    loop = asyncio.get_running_loop()

    def _fetch():
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.getcode(), dict(resp.headers), resp.read()
        except urllib.error.HTTPError as he:
            return he.code, dict(he.headers), he.read()
        except urllib.error.URLError as ue:
            return (
                502,
                {"content-type": "application/json"},
                f'{{"error": "Could not connect to port {port} inside lab container ({ue.reason}). Ensure your service is running and published on port {port}."}}'.encode(),
            )
        except Exception as e:
            return 500, {"content-type": "application/json"}, f'{{"error": "{str(e)}"}}'.encode()

    status_code, resp_headers, content = await loop.run_in_executor(None, _fetch)

    safe_headers = {}
    for k, v in resp_headers.items():
        if k.lower() not in ("transfer-encoding", "content-length", "connection"):
            safe_headers[k] = v

    return Response(
        content=content,
        status_code=status_code,
        headers=safe_headers,
        media_type=safe_headers.get("content-type", "text/html"),
    )
