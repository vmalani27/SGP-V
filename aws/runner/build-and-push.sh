#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build-and-push.sh — Build & Push GitHub Actions Runner Image to ECR
# ──────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID="586177432842"
ECR_REGISTRY="${ECR_REGISTRY:-${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com}"
IMAGE_NAME="vmalani/labops-images"
IMAGE_TAG="runner-2.337.0"
FULL_IMAGE="${ECR_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> 1. Authenticating with Amazon ECR (${REGION})..."
aws ecr get-login-password --region "${REGION}" | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

echo "==> 2. Building GitHub Actions Runner Image (${FULL_IMAGE})..."
docker build -t "${FULL_IMAGE}" "${SCRIPT_DIR}"

echo "==> 3. Pushing Image to Amazon ECR..."
docker push "${FULL_IMAGE}"

echo "=================================================="
echo "SUCCESS: Runner Image pushed to Amazon ECR:"
echo "         ${FULL_IMAGE}"
echo "=================================================="
