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
echo "  -> Building labops-ubuntu:latest..."
docker build -t labops-ubuntu:latest \
  -f "$LAB_IMAGES_DIR/Dockerfile.ubuntu" \
  "$LAB_IMAGES_DIR"

# Pre-pull and save images for Docker Fundamentals module
echo "  -> Pre-pulling internal images for Docker Fundamentals..."
mkdir -p "$LAB_IMAGES_DIR/preloads"
docker pull alpine:latest
docker save alpine:latest -o "$LAB_IMAGES_DIR/preloads/alpine.tar"
docker pull nginx:alpine
docker save nginx:alpine -o "$LAB_IMAGES_DIR/preloads/nginx.tar"

# Build Docker Fundamentals module image
echo "  -> Building labops-docker-fundamentals:latest..."
docker build -t labops-docker-fundamentals:latest \
  -f "$LAB_IMAGES_DIR/Dockerfile.docker-fundamentals" \
  "$LAB_IMAGES_DIR"

echo "==> Lab images built successfully."
echo "    - labops-ubuntu:latest"
echo "    - labops-docker-fundamentals:latest"
