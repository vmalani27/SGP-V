#!/usr/bin/env bash
set -euo pipefail

echo "==> Stopping Sysbox..."
sudo systemctl stop sysbox 2>/dev/null || true

echo "==> Stopping Docker..."
sudo systemctl stop docker 2>/dev/null || true
sudo systemctl stop containerd 2>/dev/null || true

echo "==> Removing Sysbox..."
if dpkg-query -W -f='${Status}' sysbox-ce 2>/dev/null | grep -q "install ok installed"; then
    sudo apt purge -y sysbox-ce
else
    echo "    sysbox-ce is not installed."
fi

echo "==> Unholding Docker packages..."
sudo apt-mark unhold \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin \
    docker-ce-rootless-extras \
    2>/dev/null || true

echo "==> Purging Docker packages..."
sudo apt purge -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin 2>/dev/null || true
sudo apt purge -y docker-ce-rootless-extras 2>/dev/null || true

echo "==> Removing Docker data..."
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd

echo "==> Removing Docker repository..."
sudo rm -f /etc/apt/sources.list.d/docker.list
sudo rm -f /etc/apt/sources.list.d/docker.sources

echo "==> Removing Docker repository keys..."
sudo rm -f /etc/apt/keyrings/docker.gpg
sudo rm -f /etc/apt/keyrings/docker.asc

echo "==> Removing unused dependencies..."
sudo apt autoremove -y

echo "==> Updating APT..."
sudo apt update

echo
echo "==> Verification"

DOCKER_BIN=$(command -v docker || true)
if [ -n "$DOCKER_BIN" ] && [[ "$DOCKER_BIN" != /mnt/c/* ]]; then
    echo "ERROR: docker is still installed at $DOCKER_BIN"
    exit 1
else
    echo "OK: docker removed (native Linux)"
fi

CONTAINERD_BIN=$(command -v containerd || true)
if [ -n "$CONTAINERD_BIN" ] && [[ "$CONTAINERD_BIN" != /mnt/c/* ]]; then
    echo "ERROR: containerd is still installed at $CONTAINERD_BIN"
    exit 1
else
    echo "OK: containerd removed (native Linux)"
fi

if command -v sysbox-runc >/dev/null 2>&1; then
    echo "ERROR: sysbox-runc is still installed"
    exit 1
else
    echo "OK: sysbox-runc removed"
fi

echo
echo "Docker Engine + containerd + Sysbox cleanup complete."