#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build-lab-images.sh — Pull or build lab container images
# ──────────────────────────────────────────────────────────────
set -euo pipefail

REGISTRY="${ECR_REGISTRY:-public.ecr.aws/i9t1l0m7/vmalani27}"
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
    echo "     [✔] Pulled $remote_img -> $local_tag"
  else
    echo "     [!] Could not pull $remote_img, building locally..."
    docker build -t "$local_tag" -f "$LAB_IMAGES_DIR/$dockerfile" "$LAB_IMAGES_DIR"
  fi
}

pull_or_build "$REGISTRY/labops-base:$TAG" "labops-ubuntu:latest" "Dockerfile.ubuntu"
pull_or_build "$REGISTRY/labops-labs:docker-$TAG" "labops-docker:latest" "Dockerfile.docker"
pull_or_build "$REGISTRY/labops-labs:docker-fundamentals-$TAG" "labops-docker-fundamentals:latest" "Dockerfile.docker-fundamentals"
pull_or_build "$REGISTRY/labops-labs:docker-build-$TAG" "labops-docker-build:latest" "Dockerfile.docker-build"

echo "==> All lab images ready:"
echo "    - labops-ubuntu:latest"
echo "    - labops-docker:latest"
echo "    - labops-docker-fundamentals:latest"
echo "    - labops-docker-build:latest"
