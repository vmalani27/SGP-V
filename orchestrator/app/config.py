import os


DOCKER_HOST = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock")
LAB_PREFIX = os.getenv("LAB_PREFIX", "sgp-lab")
DEMO_PREFIX = os.getenv("DEMO_PREFIX", "sgp-demo")
LAB_TIMEOUT_MINUTES = int(os.getenv("LAB_TIMEOUT_MINUTES", "40"))
DEMO_TIMEOUT_MINUTES = int(os.getenv("DEMO_TIMEOUT_MINUTES", "30"))
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-change-in-production")
JWT_ALGORITHM = "HS256"

LABEL_PREFIX = "com.sgp"
LABEL_USER_ID = f"{LABEL_PREFIX}.user_id"
LABEL_COURSE_ID = f"{LABEL_PREFIX}.course_id"
LABEL_LAB_ID = f"{LABEL_PREFIX}.lab_id"
LABEL_DEMO_ID = f"{LABEL_PREFIX}.demo_id"
