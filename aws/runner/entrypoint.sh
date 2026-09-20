#!/usr/bin/env bash
set -eo pipefail

# ──────────────────────────────────────────────────────────────
# GitHub Actions Self-Hosted Runner Entrypoint Script
# ──────────────────────────────────────────────────────────────

GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-vmalani27/SGP-V}"
RUNNER_NAME="${RUNNER_NAME:-fargate-runner-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,aws,fargate,ap-south-1}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-_work}"

if [ -z "${GITHUB_PAT}" ] && [ -z "${RUNNER_TOKEN}" ]; then
  echo "[-] ERROR: Neither GITHUB_PAT nor RUNNER_TOKEN environment variable is set."
  echo "    Please provide GITHUB_PAT (Personal Access Token with 'repo' scope) or RUNNER_TOKEN."
  exit 1
fi

# Obtain registration token if GITHUB_PAT is provided
if [ -n "${GITHUB_PAT}" ]; then
  echo "==> Fetching GitHub runner registration token for repository: ${GITHUB_REPOSITORY}..."
  REGISTRATION_TOKEN=$(curl -sX POST \
    -H "Authorization: token ${GITHUB_PAT}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runners/registration-token" | jq -r .token)

  if [ -z "${REGISTRATION_TOKEN}" ] || [ "${REGISTRATION_TOKEN}" == "null" ]; then
    echo "[-] ERROR: Failed to obtain registration token from GitHub API. Verify your GITHUB_PAT and repo access."
    exit 1
  fi
else
  REGISTRATION_TOKEN="${RUNNER_TOKEN}"
fi

cleanup() {
  echo "==> Received shutdown signal. Deregistering runner '${RUNNER_NAME}' from GitHub..."
  if [ -n "${GITHUB_PAT}" ]; then
    REMOVE_TOKEN=$(curl -sX POST \
      -H "Authorization: token ${GITHUB_PAT}" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runners/remove-token" | jq -r .token)
  else
    REMOVE_TOKEN="${REGISTRATION_TOKEN}"
  fi

  if [ -n "${REMOVE_TOKEN}" ] && [ "${REMOVE_TOKEN}" != "null" ]; then
    ./config.sh remove --token "${REMOVE_TOKEN}" || true
    echo "[✔] Runner deregistered successfully."
  fi
  exit 0
}

trap 'cleanup' SIGINT SIGTERM EXIT

echo "==> Configuring GitHub Actions runner '${RUNNER_NAME}'..."
./config.sh \
  --url "https://github.com/${GITHUB_REPOSITORY}" \
  --token "${REGISTRATION_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --work "${RUNNER_WORKDIR}" \
  --unattended \
  --replace

echo "==> Starting runner listener..."
./run.sh &
RUN_PID=$!

wait "${RUN_PID}"
