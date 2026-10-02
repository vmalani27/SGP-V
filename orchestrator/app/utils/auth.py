from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import ALLOWED_SECRETS, ORCHESTRATOR_SECRET

security = HTTPBearer(auto_error=False)

def verify_orchestrator_secret(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    elif "x-orchestrator-secret" in request.headers:
        token = request.headers["x-orchestrator-secret"]
    elif "token" in request.query_params:
        token = request.query_params["token"]

    if not token or token not in ALLOWED_SECRETS:
        raise HTTPException(
            status_code=401,
            detail="Invalid ORCHESTRATOR_SECRET. Local-first orchestrator access requires the shared secret."
        )
    return token
