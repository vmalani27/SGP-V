#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# setup-ecr.sh — Setup Amazon ECR repositories and IAM policy
# ──────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
ROLE_NAME="${AWS_ROLE_NAME:-labops-role-dev}"
POLICY_NAME="labops-ecr-publish-policy-dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPOS=(
  "vmalani/labops-images"
  "vmalani/labops-images/orchestrator"
  "vmalani/labops-images/frontend"
  "vmalani/labops-images/content-sync"
  "vmalani/labops-images/lab-ubuntu"
  "vmalani/labops-images/lab-docker"
  "vmalani/labops-images/lab-docker-fundamentals"
  "vmalani/labops-images/lab-docker-build"
  "labops-orchestrator"
  "labops-frontend"
  "labops-content-sync"
  "labops-lab-ubuntu"
  "labops-lab-docker"
  "labops-lab-docker-fundamentals"
  "labops-lab-docker-build"
)

echo "==> 1. Creating Amazon ECR (Private) Repositories in $REGION..."
for repo in "${REPOS[@]}"; do
  if aws ecr describe-repositories --repository-names "$repo" --region "$REGION" >/dev/null 2>&1; then
    echo "  - [✔] Repository '$repo' already exists."
  else
    echo "  - [+] Creating repository '$repo'..."
    aws ecr create-repository \
      --repository-name "$repo" \
      --region "$REGION" \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 >/dev/null
  fi
done

echo ""
echo "==> 2. Creating / Updating IAM Inline Policy on Role '$ROLE_NAME'..."
POLICY_FILE="$SCRIPT_DIR/policy/ecr-publish-policy-dev.json"

if [ -f "$POLICY_FILE" ]; then
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "$POLICY_NAME" \
    --policy-document "file://$POLICY_FILE"
  echo "  - [✔] Successfully attached inline policy '$POLICY_NAME' to IAM role '$ROLE_NAME'."
else
  echo "  - [!] Error: Policy file $POLICY_FILE not found."
  exit 1
fi

echo ""
echo "=================================================="
echo "SUCCESS: Amazon ECR Repositories & IAM Role configured!"
echo "=================================================="
