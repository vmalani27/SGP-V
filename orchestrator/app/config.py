import os


DOCKER_HOST = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock")

LAB_PREFIX = os.getenv("LAB_PREFIX", "labops-lab")
DEMO_PREFIX = os.getenv("DEMO_PREFIX", "labops-demo")
LAB_TIMEOUT_MINUTES = int(os.getenv("LAB_TIMEOUT_MINUTES", "40"))
DEMO_TIMEOUT_MINUTES = int(os.getenv("DEMO_TIMEOUT_MINUTES", "30"))
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-change-in-production")
JWT_ALGORITHM = "HS256"
# Tolerated clock skew (seconds) between the backend (Docker VM) that mints the
# WS tokens and this orchestrator (Vagrant VM). Prevents "not yet valid (iat)"
# rejections when VM clocks drift.
JWT_LEEWAY_SECONDS = int(os.environ.get("JWT_LEEWAY_SECONDS", "30"))

LABEL_PREFIX = "com.labops"
LABEL_USER_ID = f"{LABEL_PREFIX}.user_id"
LABEL_COURSE_ID = f"{LABEL_PREFIX}.course_id"
LABEL_LAB_ID = f"{LABEL_PREFIX}.lab_id"
LABEL_DEMO_ID = f"{LABEL_PREFIX}.demo_id"

ORCHESTRATOR_SECRET = os.getenv("ORCHESTRATOR_SECRET", "local-dev-super-secret")
MAX_CONCURRENT_LABS = int(os.getenv("MAX_CONCURRENT_LABS", "1"))

# Container runtime mode:
# - "sysbox": Secure student/production mode using sysbox-runc (default)
# - "standard" | "privileged" | "dev": Developer fallback using standard runc with privileged=True (for Docker Desktop on Windows/macOS)
CONTAINER_RUNTIME_MODE = os.getenv("CONTAINER_RUNTIME_MODE", "sysbox").lower()

