#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build-lab-images.sh — Build lab container images for development
# ──────────────────────────────────────────────────────────────
# During development, lab images are built locally inside the Vagrant VM.
# In deployment, images are pulled from a Docker registry instead.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ORCHESTRATOR_DIR="/opt/sgp/orchestrator"
LAB_IMAGES_DIR="$ORCHESTRATOR_DIR/lab-images"

echo "==> Building lab container images..."

# Build base Ubuntu image
echo "  -> Building sgp-lab-ubuntu:latest..."
docker build -t sgp-lab-ubuntu:latest \
  -f "$LAB_IMAGES_DIR/Dockerfile.ubuntu" \
  "$LAB_IMAGES_DIR"

# Build Docker-in-Docker image (depends on sgp-lab-ubuntu)
echo "  -> Building sgp-lab-docker:latest..."
docker build -t sgp-lab-docker:latest \
  -f "$LAB_IMAGES_DIR/Dockerfile.docker" \
  "$LAB_IMAGES_DIR"

echo "==> Lab images built successfully."
echo "    - sgp-lab-ubuntu:latest"
echo "    - sgp-lab-docker:latest"
