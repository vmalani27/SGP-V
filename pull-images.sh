#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "LabOps: Pulling Images from GitHub Container Registry"
echo "=================================================="
echo ""

TAG="${1:-dev}"
REGISTRY="ghcr.io/vmalani27/sgp-v"

echo "[1/6] Pulling Backend Service ($REGISTRY/backend:$TAG)..."
docker pull "$REGISTRY/backend:$TAG"

echo ""
echo "[2/6] Pulling Frontend Service ($REGISTRY/frontend:$TAG)..."
docker pull "$REGISTRY/frontend:$TAG"

echo ""
echo "[3/6] Pulling Orchestrator Service ($REGISTRY/orchestrator:$TAG)..."
docker pull "$REGISTRY/orchestrator:$TAG"

echo ""
echo "[4/6] Pulling Base Ubuntu Lab Image ($REGISTRY/lab-ubuntu:$TAG)..."
docker pull "$REGISTRY/lab-ubuntu:$TAG"
docker tag "$REGISTRY/lab-ubuntu:$TAG" labops-ubuntu:latest
docker tag "$REGISTRY/lab-ubuntu:$TAG" sgp-lab-ubuntu:latest

echo ""
echo "[5/6] Pulling Docker-in-Docker Lab Image ($REGISTRY/lab-docker:$TAG)..."
docker pull "$REGISTRY/lab-docker:$TAG"
docker tag "$REGISTRY/lab-docker:$TAG" labops-docker:latest
docker tag "$REGISTRY/lab-docker:$TAG" sgp-lab-docker:latest

echo ""
echo "[6/6] Pulling Preloaded Fundamentals Lab Image ($REGISTRY/lab-docker-fundamentals:$TAG)..."
docker pull "$REGISTRY/lab-docker-fundamentals:$TAG"
docker tag "$REGISTRY/lab-docker-fundamentals:$TAG" labops-docker-fundamentals:latest
docker tag "$REGISTRY/lab-docker-fundamentals:$TAG" sgp-lab-docker-fundamentals:latest

echo ""
echo "=================================================="
echo "SUCCESS: All LabOps services and lab images are ready!"
echo "=================================================="
