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
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import DEMO_PREFIX, LABEL_DEMO_ID, LABEL_USER_ID
from app.services.docker_service import DockerService, get_docker_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demos", tags=["demos"])


class CreateDemoRequest(BaseModel):
    demo_id: str
    image: str = "sgp-lab-docker:latest"
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
    """
    name = f"{DEMO_PREFIX}-{uuid4().hex[:12]}"
    labels = {
        LABEL_USER_ID: req.user_id,
        LABEL_DEMO_ID: req.demo_id,
    }

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
    after the orchestrator restarted.
    """
    containers = docker_svc.get_labs_by_labels({
        LABEL_USER_ID: user_id,
        LABEL_DEMO_ID: demo_id,
    })
    if not containers:
        raise HTTPException(
            status_code=404,
            detail="No live demo container for this user and demo",
        )
    containers.sort(key=lambda c: c.get("created", ""), reverse=True)
    return containers[0]


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
        raise HTTPException(status_code=500, detail=str(e))
    return {"exit_code": exit_code, "output": output}


@router.delete("/{name}")
def destroy_demo(name: str, docker_svc: DockerService = Depends(get_docker_service)):
    """Destroy a demo container. Safe no-op if it is already gone."""
    try:
        docker_svc.destroy_lab(name)
    except RuntimeError:
        pass
    return {"status": "destroyed"}