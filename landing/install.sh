#!/usr/bin/env bash
# LabOps CLI Installer & Launcher for Linux
# Usage:
#   curl -fsSL <CDN_URL>/install.sh | bash
#   curl -fsSL <CDN_URL>/install.sh | bash -s -- [start|doctor|status|stop]
#
# This script:
# 1. Detects Linux architecture (x86_64/amd64).
# 2. Resolves and downloads the matching labops binary from the release slug.
# 3. Installs the binary to ~/.local/bin (or /usr/local/bin if root/writable).
# 4. Ensures the install directory is added to PATH in shell profiles (~/.bashrc, ~/.zshrc).
# 5. Executes 'labops start' (or custom arguments if provided).

set -euo pipefail

# ── 1. OS & ARCHITECTURE CHECK ───────────────────────────────────────────
OS="$(uname -s)"
if [ "$OS" != "Linux" ]; then
  echo "Error: This installer is intended for Linux. Detected OS: $OS" >&2
  echo "For Windows, please use the Windows binary (.exe) from the portal." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    ARCH_SUFFIX="amd64"
    ;;
  *)
    echo "Error: LabOps currently supports Linux x86_64 (amd64). Detected architecture: $ARCH" >&2
    exit 1
    ;;
esac

# ── 2. BASE URL RESOLUTION ───────────────────────────────────────────────
DEFAULT_CDN="https://d3rqfqpemi0u1s.cloudfront.net"
# TARGET_BASE_URL is replaced with the exact preview/beta/release slug by CI at upload time.
TARGET_BASE_URL="__LABOPS_TARGET_BASE_URL__"

if [ -n "${LABOPS_BASE_URL:-}" ]; then
  BASE_URL="${LABOPS_BASE_URL}"
elif [[ "$TARGET_BASE_URL" =~ ^https?:// ]]; then
  BASE_URL="$TARGET_BASE_URL"
else
  BASE_URL="$DEFAULT_CDN"
fi

BASE_URL="${BASE_URL%/}"
DOWNLOAD_URL="${BASE_URL}/downloads/labops-linux-${ARCH_SUFFIX}"

# ── 3. INSTALLATION DIRECTORY & PATH SETUP ────────────────────────────────
if [ "$(id -u)" -eq 0 ] && [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local}/bin"
fi

mkdir -p "$INSTALL_DIR"
TARGET_BIN="${INSTALL_DIR}/labops"

# ── 4. DOWNLOAD LABOPS BINARY ────────────────────────────────────────────
echo "==> Downloading LabOps CLI (${ARCH_SUFFIX}) from ${DOWNLOAD_URL}..."
TMP_BIN="$(mktemp "${TARGET_BIN}.tmp.XXXXXX")"
trap 'rm -f "$TMP_BIN"' EXIT

download_file() {
  local url="$1"
  local dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    echo "Error: Neither curl nor wget was found. Please install curl or wget." >&2
    exit 1
  fi
}

if ! download_file "${DOWNLOAD_URL}" "${TMP_BIN}"; then
  if [ "$BASE_URL" != "$DEFAULT_CDN" ]; then
    FALLBACK_URL="${DEFAULT_CDN}/downloads/labops-linux-${ARCH_SUFFIX}"
    echo "==> Slug download failed. Retrying from default CDN: ${FALLBACK_URL}..."
    download_file "${FALLBACK_URL}" "${TMP_BIN}"
  else
    echo "Error: Failed to download LabOps binary from ${DOWNLOAD_URL}" >&2
    exit 1
  fi
fi

chmod +x "${TMP_BIN}"
mv -f "${TMP_BIN}" "${TARGET_BIN}"
trap - EXIT

# Also create a convenience symlink in the current directory if writable and different
if [ "$PWD" != "$INSTALL_DIR" ] && [ -w "$PWD" ]; then
  ln -sf "$TARGET_BIN" "./labops" 2>/dev/null || true
fi

# ── 5. ENSURE INSTALL_DIR IS IN PATH ─────────────────────────────────────
PATH_CONFIGURED=0
case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    PATH_CONFIGURED=1
    ;;
  *)
    export PATH="${INSTALL_DIR}:${PATH}"
    ;;
esac

if [ "$PATH_CONFIGURED" -eq 0 ] && [ "$INSTALL_DIR" != "/usr/local/bin" ]; then
  PROFILE_TARGET=""
  USER_SHELL="$(basename "${SHELL:-bash}")"

  if [ "$USER_SHELL" = "zsh" ] && [ -f "$HOME/.zshrc" ]; then
    PROFILE_TARGET="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    PROFILE_TARGET="$HOME/.bashrc"
  elif [ -f "$HOME/.profile" ]; then
    PROFILE_TARGET="$HOME/.profile"
  fi

  if [ -n "$PROFILE_TARGET" ]; then
    if ! grep -qs 'export PATH=.*\.local/bin' "$PROFILE_TARGET"; then
      printf '\n# Added by LabOps installer\nexport PATH="%s:$PATH"\n' "$INSTALL_DIR" >> "$PROFILE_TARGET"
      echo "==> Added ${INSTALL_DIR} to PATH in ${PROFILE_TARGET}"
    fi
  fi
fi

echo "==> LabOps CLI successfully installed to: ${TARGET_BIN}"
echo "    Version: $("${TARGET_BIN}" version 2>/dev/null || echo 'installed')"
echo ""

# ── 6. EXECUTE LABOPS ────────────────────────────────────────────────────
# Restore stdin from /dev/tty if running piped (curl ... | bash)
if [ -t 1 ] && [ -e /dev/tty ]; then
  exec < /dev/tty
fi

if [ $# -gt 0 ]; then
  echo "==> Running: labops $*"
  exec "$TARGET_BIN" "$@"
else
  echo "==> Launching: labops start"
  exec "$TARGET_BIN" start
fi
