#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "LabOps: Pulling Images from Amazon ECR Public"
echo "=================================================="
echo ""

TAG="${1:-dev}"
REGISTRY="${ECR_REGISTRY:-public.ecr.aws/i9t1l0m7/vmalani27}"

echo "[1/6] Pulling Frontend Service ($REGISTRY/labops-frontend:$TAG)..."
docker pull "$REGISTRY/labops-frontend:$TAG"

echo ""
echo "[2/6] Pulling Orchestrator Service ($REGISTRY/labops-orchestrator:$TAG)..."
docker pull "$REGISTRY/labops-orchestrator:$TAG"

echo ""
echo "[3/8] Pulling Content-Sync Service ($REGISTRY/labops-content-sync:$TAG)..."
docker pull "$REGISTRY/labops-content-sync:$TAG"

echo ""
echo "[4/8] Pulling Base Ubuntu Lab Image ($REGISTRY/labops-base:$TAG)..."
docker pull "$REGISTRY/labops-base:$TAG"
docker tag "$REGISTRY/labops-base:$TAG" labops-ubuntu:latest
docker tag "$REGISTRY/labops-base:$TAG" sgp-lab-ubuntu:latest

echo ""
echo "[5/8] Pulling Docker-in-Docker Lab Image ($REGISTRY/labops-labs:docker-$TAG)..."
docker pull "$REGISTRY/labops-labs:docker-$TAG"
docker tag "$REGISTRY/labops-labs:docker-$TAG" labops-docker:latest
docker tag "$REGISTRY/labops-labs:docker-$TAG" sgp-lab-docker:latest

echo ""
echo "[6/8] Pulling Preloaded Fundamentals Lab Image ($REGISTRY/labops-labs:docker-fundamentals-$TAG)..."
docker pull "$REGISTRY/labops-labs:docker-fundamentals-$TAG"
docker tag "$REGISTRY/labops-labs:docker-fundamentals-$TAG" labops-docker-fundamentals:latest
docker tag "$REGISTRY/labops-labs:docker-fundamentals-$TAG" sgp-lab-docker-fundamentals:latest

echo ""
echo "[7/8] Pulling Preloaded Docker Build Lab Image ($REGISTRY/labops-labs:docker-build-$TAG)..."
docker pull "$REGISTRY/labops-labs:docker-build-$TAG"
docker tag "$REGISTRY/labops-labs:docker-build-$TAG" labops-docker-build:latest
docker tag "$REGISTRY/labops-labs:docker-build-$TAG" sgp-lab-docker-build:latest

echo ""
echo "[8/8] Pulling Preloaded Git Fundamentals Lab Image ($REGISTRY/labops-labs:git-fundamentals-$TAG)..."
docker pull "$REGISTRY/labops-labs:git-fundamentals-$TAG" || true
docker tag "$REGISTRY/labops-labs:git-fundamentals-$TAG" labops-git-fundamentals:latest || true
docker tag "$REGISTRY/labops-labs:git-fundamentals-$TAG" sgp-lab-git-fundamentals:latest || true

echo ""
echo "=================================================="
echo "SUCCESS: All LabOps services and lab images are ready!"
echo "=================================================="
