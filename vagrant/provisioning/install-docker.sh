#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# install-docker.sh — Install Docker CE on Ubuntu 22.04
# ──────────────────────────────────────────────────────────────
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "==> Ensuring resilient DNS resolution..."
systemctl restart systemd-resolved || true
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

echo "==> Updating package indices & installing prerequisites..."
apt-get update -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release jq \
  apt-transport-https rsync kmod \
  "linux-headers-$(uname -r)"

echo "==> Configuring Docker APT repository..."
install -m 0755 -d /etc/apt/keyrings
rm -f /etc/apt/keyrings/docker.gpg
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor --yes --batch -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y

echo "==> Installing Docker CE (pinned for Sysbox 0.7.0 / containerd 1.x compatibility)..."
apt-get install -y \
  docker-ce=5:27.5.1-1~ubuntu.22.04~jammy \
  docker-ce-cli=5:27.5.1-1~ubuntu.22.04~jammy \
  containerd.io=1.7.29-1~ubuntu.22.04~jammy \
  docker-buildx-plugin docker-compose-plugin

echo "==> Holding Docker packages to prevent accidental upgrades..."
apt-mark hold docker-ce docker-ce-cli containerd.io

echo "==> Adding vagrant user to docker group..."
usermod -aG docker vagrant

echo "==> Docker CE installed successfully."
