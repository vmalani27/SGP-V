#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build-lab-images.sh — Pull or build lab container images
# ──────────────────────────────────────────────────────────────
set -euo pipefail

REGISTRY_REPO="ghcr.io/vmalani27/sgp-v"
TAG="${1:-dev}"
ORCHESTRATOR_DIR="/opt/sgp/orchestrator"
LAB_IMAGES_DIR="$ORCHESTRATOR_DIR/lab-images"

echo "==> Preparing lab container images (Tag: $TAG)..."

pull_or_build() {
  local remote_img="$1"
  local local_tag="$2"
  local dockerfile="$3"

  echo "  -> Fetching $local_tag..."
  if docker pull "$remote_img" 2>/dev/null; then
    docker tag "$remote_img" "$local_tag"
    echo "     [✓] Pulled $remote_img -> $local_tag"
  else
    echo "     [!] Could not pull $remote_img, building locally..."
    docker build -t "$local_tag" -f "$LAB_IMAGES_DIR/$dockerfile" "$LAB_IMAGES_DIR"
  fi
}

pull_or_build "$REGISTRY_REPO/lab-ubuntu:$TAG" "labops-ubuntu:latest" "Dockerfile.ubuntu"
pull_or_build "$REGISTRY_REPO/lab-docker:$TAG" "labops-docker:latest" "Dockerfile.docker"
pull_or_build "$REGISTRY_REPO/lab-docker-fundamentals:$TAG" "labops-docker-fundamentals:latest" "Dockerfile.docker-fundamentals"

echo "==> All lab images ready:"
echo "    - labops-ubuntu:latest"
echo "    - labops-docker:latest"
echo "    - labops-docker-fundamentals:latest"
