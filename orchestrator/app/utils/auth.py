from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import ORCHESTRATOR_SECRET

security = HTTPBearer()

def verify_orchestrator_secret(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials != ORCHESTRATOR_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Invalid ORCHESTRATOR_SECRET. Local-first orchestrator access requires the shared secret."
        )
    return credentials
