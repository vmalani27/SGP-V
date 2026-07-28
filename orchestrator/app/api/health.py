from fastapi import APIRouter, Depends

from app.services.docker_service import DockerService, get_docker_service

router = APIRouter(tags=["health"])


@router.get("/health")
def health(docker_svc: DockerService = Depends(get_docker_service)):
    try:
        docker_info = docker_svc.client.info()
        return {
            "status": "ok",
            "docker": "connected",
            "server_version": docker_info.get("ServerVersion", "unknown"),
        }
    except Exception as e:
        return {
            "status": "degraded",
            "docker": "disconnected",
            "error": str(e),
        }
