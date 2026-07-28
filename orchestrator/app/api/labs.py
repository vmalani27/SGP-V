import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import LAB_PREFIX
from app.models.session import LabSession, LabStatus
from app.services.docker_service import DockerService, get_docker_service, lab_id_to_number


SCHEMA_HELP = {
    "schema_url": "/schemas/yaml",
    "sample_url": "/schemas/sample",
    "help": "If your lab.yaml has errors, download the sample from /schemas/sample for reference.",
}

router = APIRouter(prefix="/labs", tags=["labs"])

sessions: dict[str, LabSession] = {}


class StartLabRequest(BaseModel):
    lab_id: str
    image: str
    apt_packages: list[str] = []
    pre_pull: list[str] = []


class ActivateLabRequest(BaseModel):
    lab_id: str


class InspectRequest(BaseModel):
    path: str
    check: str


class ExecRequest(BaseModel):
    command: str
    user: str = "student"


@router.post("")
def start_lab(req: StartLabRequest, docker_svc: DockerService = Depends(get_docker_service)):
    lab_number = lab_id_to_number(req.lab_id)

    session = LabSession(lab_type="custom", lab_id=req.lab_id, user_id="")
    session.container_name = f"{LAB_PREFIX}-{session.session_id}"

    try:
        info = docker_svc.start_lab(req.image, session.container_name)
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
        docker_svc.activate_lab(session.container_name, lab_number)
    except RuntimeError as e:
        session.status = LabStatus.ERROR
        sessions[session.session_id] = session
        return JSONResponse(status_code=500, content={
            "detail": str(e),
            **SCHEMA_HELP,
        })

    sessions[session.session_id] = session
    return session


@router.get("")
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


@router.get("/{session_id}")
def get_lab(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/activate")
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


@router.post("/{session_id}/stop")
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


@router.post("/{session_id}/resume")
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


@router.delete("/{session_id}")
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


@router.post("/{session_id}/validate")
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


@router.post("/{session_id}/inspect")
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


@router.post("/{session_id}/exec")
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

    exit_code, output = docker_svc.exec_command(
        session.container_name,
        ["/bin/bash", "-c", request.command],
        user=request.user,
    )

    return {
        "command": request.command,
        "exit_code": exit_code,
        "output": output,
    }
