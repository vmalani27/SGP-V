"""
Demo environments API — disposable, ungraded containers for interactive
chapter demonstrations.

Demos are deliberately separate from labs:
- No session model, no task validation, no student user, no progress tracking.
- A demo container is created on demand, executes predefined commands, and is
  destroyed/reset. It never touches the learner's lab container.
- The orchestrator is the source of truth for live demo containers, queried by
  Docker labels (user_id + demo_id) via /demos/by_key, so the backend can
  re-attach after a restart instead of spawning duplicates.
"""

import logging
import threading
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import DEMO_PREFIX, LABEL_DEMO_ID, LABEL_USER_ID
from app.services.docker_service import DockerService, get_docker_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demos", tags=["demos"])

# Per-(user_id, demo_id) mutexes so a burst of concurrent creates for the same
# demo collapses into one `docker run`. The backend also single-flights ensures
# (backend/app/routers/demos.py), but the authoritative invariant must live
# here, at the point where containers are actually created: several callers can
# otherwise all pass the `by_key` -> 404 check before the first container
# registers its labels and each triggers a redundant Sysbox DinD spawn. Even one
# stray wait-free request that bypasses `ensure` is neutralized here.
_create_locks: dict[str, threading.Lock] = {}
_create_locks_guard = threading.Lock()


def _create_lock_for(user_id: str, demo_id: str) -> threading.Lock:
    key = f"{user_id}:{demo_id}"
    with _create_locks_guard:
        lock = _create_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _create_locks[key] = lock
        return lock


class CreateDemoRequest(BaseModel):
    demo_id: str
    image: str = "labops-docker-fundamentals:latest"
    user_id: str = ""
    pre_pull: list[str] = []


class ExecDemoRequest(BaseModel):
    command: str
    user: str = "root"


@router.post("")
def create_demo(req: CreateDemoRequest, docker_svc: DockerService = Depends(get_docker_service)):
    """Create a disposable demo container and wait for its inner Docker daemon.

    Returns the container name so the backend can run steps against it. If an
    image is listed in pre_pull it is pulled into the container's inner daemon
    so the first demo step is fast and reproducible.

    Idempotent per (user_id, demo_id): concurrent requesters wait on a mutex,
    and after acquiring it they re-check for an already-running container and
    reuse it rather than spawning a duplicate Sysbox DinD container.
    """
    labels = {
        LABEL_USER_ID: req.user_id,
        LABEL_DEMO_ID: req.demo_id,
    }

    from app.config import MAX_CONCURRENT_LABS, DEMO_PREFIX, LAB_PREFIX
    from app.utils.locks import global_provisioning_lock

    lock = _create_lock_for(req.user_id, req.demo_id)
    with lock, global_provisioning_lock:
        # Re-check inside the lock
        existing = docker_svc.get_running_lab_by_labels(labels)
        if existing:
            logger.info(
                f"Demo '{req.demo_id}' reused existing container '{existing['name']}'"
            )
            return {
                "name": existing["name"],
                "status": existing["status"],
                "container_id": existing["id"],
                "reused": True,
            }

        # Auto-teardown old demos and labs to conserve memory
        all_running_demos = docker_svc.client.containers.list(all=True, filters={"name": DEMO_PREFIX})
        all_running_labs = docker_svc.client.containers.list(all=True, filters={"name": LAB_PREFIX})
        
        total_running = len(all_running_demos) + len(all_running_labs)
        if total_running >= MAX_CONCURRENT_LABS:
            logger.info(f"Global limit reached ({total_running} >= {MAX_CONCURRENT_LABS}). Tearing down old labs and demos.")
            for c in all_running_demos + all_running_labs:
                try:
                    c.remove(force=True)
                except Exception as e:
                    logger.error(f"Failed to auto-destroy old container {c.name}: {e}")

        name = f"{DEMO_PREFIX}-{uuid4().hex[:12]}"

        try:
            info = docker_svc.start_lab(req.image, name, labels=labels)
        except (RuntimeError, ValueError) as e:
            raise HTTPException(status_code=500, detail=str(e))

        try:
            docker_svc.wait_for_docker(name)
            # The demo terminal attaches as `student` (via sudo, which recomputes
            # supplementary groups), so grant the docker group like lab setup does —
            # otherwise `docker ...` fails with permission denied.
            try:
                docker_svc.exec_command(
                    name,
                    ["/bin/bash", "-c", "usermod -aG docker student"],
                    user="root",
                )
            except RuntimeError:
                pass
            if req.pre_pull:
                docker_svc.pre_pull_images(name, req.pre_pull)
        except RuntimeError as e:
            # Failed demo setup: clean up the disposable container rather than
            # leaking it.
            try:
                docker_svc.destroy_lab(name)
            except RuntimeError:
                pass
            raise HTTPException(status_code=500, detail=str(e))

        logger.info(f"Demo '{req.demo_id}' ready in container '{name}'")
        return {"name": name, "status": info["status"], "container_id": info["id"]}


@router.get("/by_key")
def get_demo_by_key(
    user_id: str,
    demo_id: str,
    docker_svc: DockerService = Depends(get_docker_service),
):
    """Return the live demo container for a user+demo, or 404.

    Docker labels are the source of truth, so a demo container is found even
    after the orchestrator restarted. Only a RUNNING container is "live": a
    stopped/exited leftover (crash, aborted create, prior teardown) must not be
    handed back, or callers exec/attach to a dead container and get 409s.
    """
    demo = docker_svc.get_running_lab_by_labels({
        LABEL_USER_ID: user_id,
        LABEL_DEMO_ID: demo_id,
    })
    if not demo:
        raise HTTPException(
            status_code=404,
            detail="No live demo container for this user and demo",
        )
    return demo


@router.post("/{name}/exec")
def exec_demo(name: str, req: ExecDemoRequest, docker_svc: DockerService = Depends(get_docker_service)):
    """Run a single predefined command inside the demo container."""
    try:
        exit_code, output = docker_svc.exec_command(
            name,
            ["/bin/bash", "-c", req.command],
            user=req.user or "root",
        )
    except RuntimeError as e:
        detail = str(e)
        # A container that isn't running can't receive an exec — that's a stale
        # handle, not a server fault. Report it as 409 (re-attach/ensure will
        # provision a fresh container) rather than a generic 500.
        if "not 'running'" in detail or "not running" in detail or "not found" in detail:
            raise HTTPException(status_code=409, detail=detail)
        raise HTTPException(status_code=500, detail=detail)
    return {"exit_code": exit_code, "output": output}


@router.delete("/{name}")
def destroy_demo(name: str, docker_svc: DockerService = Depends(get_docker_service)):
    """Destroy a demo container. Safe no-op if it is already gone."""
    try:
        docker_svc.destroy_lab(name)
    except RuntimeError:
        pass
    return {"status": "destroyed"}