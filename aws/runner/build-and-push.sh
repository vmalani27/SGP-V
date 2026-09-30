#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build-and-push.sh — Build & Push GitHub Actions Runner Image to ECR
# ──────────────────────────────────────────────────────────────
set -euo pipefail

REGION="us-east-1"
ECR_REGISTRY="public.ecr.aws/i9t1l0m7"
IMAGE_NAME="vmalani27/labops-base"
IMAGE_TAG="runner-2.337.0"
FULL_IMAGE="${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 1. Authenticating with Amazon ECR (${REGION})..."
aws ecr-public get-login-password --region "${REGION}" | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

echo "==> 2. Building GitHub Actions Runner Image (${FULL_IMAGE})..."
docker build -t "${FULL_IMAGE}" "${SCRIPT_DIR}"

echo "==> 3. Pushing Image to Amazon ECR..."
docker push "${FULL_IMAGE}"

echo "=================================================="
echo "SUCCESS: Runner Image pushed to Amazon ECR:"
echo "         ${FULL_IMAGE}"
echo "=================================================="
