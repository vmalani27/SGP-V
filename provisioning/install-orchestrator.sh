#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# install-orchestrator.sh — Build and start the orchestrator
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ORCHESTRATOR_DIR="/opt/sgp/orchestrator"
IMAGE_TAG="sgp-orchestrator:dev"
CONTAINER_NAME="sgp-orchestrator"

# ── Environment (override via vagrant env or .env) ────────────
JWT_SECRET="${JWT_SECRET:-dev-only-change-in-production}"
LAB_PREFIX="${LAB_PREFIX:-sgp-lab}"
DEMO_PREFIX="${DEMO_PREFIX:-sgp-demo}"
LAB_TIMEOUT_MINUTES="${LAB_TIMEOUT_MINUTES:-40}"
DEMO_TIMEOUT_MINUTES="${DEMO_TIMEOUT_MINUTES:-30}"

echo "==> Preparing orchestrator source mount..."
mkdir -p /opt/sgp

echo "==> Building orchestrator image from mounted repo..."
docker build -t "$IMAGE_TAG" "$ORCHESTRATOR_DIR"

echo "==> Starting orchestrator container..."
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p 8000:8000 \
  -e DOCKER_HOST=unix:///var/run/docker.sock \
  -e LAB_PREFIX="$LAB_PREFIX" \
  -e DEMO_PREFIX="$DEMO_PREFIX" \
  -e LAB_TIMEOUT_MINUTES="$LAB_TIMEOUT_MINUTES" \
  -e DEMO_TIMEOUT_MINUTES="$DEMO_TIMEOUT_MINUTES" \
  -e JWT_SECRET="$JWT_SECRET" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "${ORCHESTRATOR_DIR}:/app" \
  "$IMAGE_TAG"

echo "==> Orchestrator is exposed on guest :8000 → host :8001."
echo "==> Orchestrator installed successfully."
