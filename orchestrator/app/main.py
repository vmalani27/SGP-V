import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.labs import router as labs_router
from app.api.demos import router as demos_router
from app.api.schemas import router as schemas_router
from app.config import LAB_TIMEOUT_MINUTES, DEMO_TIMEOUT_MINUTES
from app.websocket.terminal import router as terminal_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def recover_sessions():
    from app.api.labs import sessions
    from app.config import LAB_PREFIX, LABEL_LAB_ID, LABEL_USER_ID
    from app.models.session import LabSession, LabStatus, parse_created_at
    from app.services.docker_service import DockerService

    docker_svc = DockerService()
    containers = docker_svc.list_labs(all=True)

    recovered = 0
    for c in containers:
        name = c["name"]
        if not name.startswith(LAB_PREFIX + "-"):
            continue

        session_id = name[len(LAB_PREFIX) + 1:]
        if session_id in sessions:
            continue

        labels = c.get("labels") or {}

        docker_status = c["status"]
        if docker_status == "running":
            status = LabStatus.RUNNING
        elif docker_status in ("exited", "dead"):
            status = LabStatus.STOPPED
        else:
            status = LabStatus.RUNNING

        image_tag = c.get("image", "")
        lab_type = "unknown"
        for lt in ["linux", "git", "docker"]:
            if lt in image_tag:
                lab_type = lt
                break

        session = LabSession(
            session_id=session_id,
            lab_type=lab_type,
            container_id=c["id"],
            container_name=name,
            status=status,
            lab_id=labels.get(LABEL_LAB_ID, ""),
            user_id=labels.get(LABEL_USER_ID, ""),
            created_at=parse_created_at(c.get("created")),
        )
        sessions[session_id] = session
        recovered += 1
        logger.info(f"Recovered session {session_id} (lab_type={lab_type}, status={docker_status})")

    if recovered:
        logger.info(f"Recovered {recovered} session(s) from Docker")
    else:
        logger.info("No existing sessions to recover")


async def lab_timeout_checker():
    from app.api.labs import sessions
    from app.services.docker_service import DockerService

    docker_svc = DockerService()

    while True:
        await asyncio.sleep(60)

        now = datetime.now(timezone.utc)
        expired = []

        for session_id, session in sessions.items():
            if session.status.value != "running":
                continue

            age_minutes = (now - session.created_at).total_seconds() / 60
            if age_minutes >= LAB_TIMEOUT_MINUTES:
                expired.append((session_id, session))

        for session_id, session in expired:
            logger.warning(
                f"Lab '{session_id}' exceeded {LAB_TIMEOUT_MINUTES}min limit "
                f"(age: {age_minutes:.0f}min). Destroying."
            )
            try:
                docker_svc.destroy_lab(session.container_name)
            except RuntimeError as e:
                logger.error(f"Failed to destroy expired lab '{session_id}': {e}")

            del sessions[session_id]

        if expired:
            logger.info(f"Destroyed {len(expired)} expired lab(s)")


async def demo_timeout_checker():
    """Destroy demo containers that outlived their disposable lifetime.

    Demos are not tracked in memory — they are purely label-addressed. Sweep
    them by prefix so an abandoned demo (tab closed, crash) is reclaimed
    instead of accumulating.
    """
    from app.config import DEMO_PREFIX
    from app.models.session import parse_created_at
    from app.services.docker_service import DockerService

    docker_svc = DockerService()

    while True:
        await asyncio.sleep(120)

        now = datetime.now(timezone.utc)
        containers = docker_svc.client.containers.list(
            all=True, filters={"name": DEMO_PREFIX}
        )
        for c in containers:
            try:
                created = parse_created_at(c.attrs.get("Created", ""))
            except Exception:
                continue
            if (now - created).total_seconds() / 60 < DEMO_TIMEOUT_MINUTES:
                continue
            logger.warning(f"Destroying expired demo container '{c.name}'")
            try:
                c.remove(force=True)
            except Exception as e:
                logger.error(f"Failed to destroy expired demo '{c.name}': {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    recover_sessions()
    task = asyncio.create_task(lab_timeout_checker())
    demo_task = asyncio.create_task(demo_timeout_checker())
    yield
    task.cancel()
    demo_task.cancel()


app = FastAPI(title="SGP Orchestrator", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(labs_router)
app.include_router(demos_router)
app.include_router(schemas_router)
app.include_router(terminal_router)
