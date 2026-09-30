#!/usr/bin/env bash
set -eo pipefail

# ──────────────────────────────────────────────────────────────
# GitHub Actions Self-Hosted Runner Entrypoint Script (Ephemeral)
# ──────────────────────────────────────────────────────────────

GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-vmalani27/SGP-V}"
RUNNER_NAME="${RUNNER_NAME:-fargate-runner-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,aws,fargate,ap-south-1}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-_work}"

if [ -z "${GITHUB_PAT}" ] && [ -z "${RUNNER_TOKEN}" ]; then
  echo "[-] ERROR: Neither GITHUB_PAT nor RUNNER_TOKEN is set."
  echo "    Please provide GITHUB_PAT (Personal Access Token with 'repo' scope) or RUNNER_TOKEN."
  exit 1
fi

if [ -n "${GITHUB_PAT}" ]; then
  echo "==> Fetching registration token for ${GITHUB_REPOSITORY}..."
  REGISTRATION_TOKEN=$(curl -sX POST \
    -H "Authorization: token ${GITHUB_PAT}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runners/registration-token" \
    | jq -r .token)

  if [ -z "${REGISTRATION_TOKEN}" ] || [ "${REGISTRATION_TOKEN}" == "null" ]; then
    echo "[-] ERROR: Failed to obtain registration token. Check GITHUB_PAT and repo access."
    exit 1
  fi
else
  REGISTRATION_TOKEN="${RUNNER_TOKEN}"
fi

cleanup() {
  echo "==> Runner shutting down (ephemeral — GitHub handles deregistration)."
}
trap 'cleanup' SIGINT SIGTERM

echo "==> Configuring runner '${RUNNER_NAME}'..."
./config.sh \
  --url "https://github.com/${GITHUB_REPOSITORY}" \
  --token "${REGISTRATION_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --work "${RUNNER_WORKDIR}" \
  --unattended \
  --replace \
  --ephemeral

echo "==> Starting runner..."
./run.sh

echo "==> Job complete. Container exiting."
