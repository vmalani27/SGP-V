#!/usr/bin/env bash
# LabOps Quick Installer & Launcher
# Usage:
#   curl -fsSL <url>/install.sh | bash
#   curl -fsSL <url>/install.sh | bash -s -- start

set -e

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    ARCH_SUFFIX="amd64"
    ;;
  *)
    echo "Error: LabOps currently supports Linux x86_64 (amd64). Detected: $ARCH" >&2
    exit 1
    ;;
esac

DEFAULT_CDN="https://d3rqfqpemi0u1s.cloudfront.net"
BASE_URL="${LABOPS_BASE_URL:-$DEFAULT_CDN}"
CHANNEL="${LABOPS_CHANNEL:-}"

if [ -n "$CHANNEL" ] && [ "$CHANNEL" != "prod" ]; then
  DOWNLOAD_URL="${BASE_URL}/downloads/${CHANNEL}/labops-linux-${ARCH_SUFFIX}"
else
  DOWNLOAD_URL="${BASE_URL}/downloads/labops-linux-${ARCH_SUFFIX}"
fi

TARGET_BIN="./labops"
echo "==> Downloading LabOps CLI from ${DOWNLOAD_URL}..."
if ! curl -fsSL "${DOWNLOAD_URL}" -o "${TARGET_BIN}"; then
  DOWNLOAD_URL="${DEFAULT_CDN}/downloads/labops-linux-${ARCH_SUFFIX}"
  echo "==> Retrying from ${DOWNLOAD_URL}..."
  curl -fsSL "${DOWNLOAD_URL}" -o "${TARGET_BIN}"
fi

chmod +x "${TARGET_BIN}"

ACTION="${1:-start}"
echo "==> Starting LabOps (${ACTION})..."
exec "${TARGET_BIN}" "${ACTION}" "${@:2}"
