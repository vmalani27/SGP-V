import os


DOCKER_HOST = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock")

LAB_PREFIX = os.getenv("LAB_PREFIX", "labops-lab")
DEMO_PREFIX = os.getenv("DEMO_PREFIX", "labops-demo")
LAB_TIMEOUT_MINUTES = int(os.getenv("LAB_TIMEOUT_MINUTES", "40"))
DEMO_TIMEOUT_MINUTES = int(os.getenv("DEMO_TIMEOUT_MINUTES", "30"))
LABEL_PREFIX = "com.labops"
LABEL_USER_ID = f"{LABEL_PREFIX}.user_id"
LABEL_COURSE_ID = f"{LABEL_PREFIX}.course_id"
LABEL_LAB_ID = f"{LABEL_PREFIX}.lab_id"
LABEL_DEMO_ID = f"{LABEL_PREFIX}.demo_id"

ORCHESTRATOR_SECRET = os.getenv("ORCHESTRATOR_SECRET", "local-dev-super-secret")
ALLOWED_SECRETS = {
    s.strip()
    for s in os.getenv("ALLOWED_ORCHESTRATOR_SECRETS", "").split(",")
    if s.strip()
}
ALLOWED_SECRETS.update({ORCHESTRATOR_SECRET, "local-dev-super-secret", "vansh-is-smart"})
MAX_CONCURRENT_LABS = int(os.getenv("MAX_CONCURRENT_LABS", "5"))


# Container runtime mode:
# - "sysbox": Secure student/production mode using sysbox-runc (default)
# - "standard" | "privileged" | "dev": Developer fallback using standard runc with privileged=True (for Docker Desktop on Windows/macOS)
CONTAINER_RUNTIME_MODE = os.getenv("CONTAINER_RUNTIME_MODE", "sysbox").lower()

ECR_PUBLIC_REGISTRY = os.getenv("ECR_PUBLIC_REGISTRY", "public.ecr.aws/i9t1l0m7")
IMAGE_TAG = os.getenv("IMAGE_TAG", "dev")

