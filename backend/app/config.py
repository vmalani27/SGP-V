import os

ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://localhost:8001")
WS_ORCHESTRATOR_URL = os.environ.get("WS_ORCHESTRATOR_URL", "ws://localhost:8001")
CONTENT_PUBLIC_BASE_URL = os.environ.get("CONTENT_PUBLIC_BASE_URL", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_MINUTES = int(os.environ.get("JWT_EXPIRY_MINUTES", "45"))
