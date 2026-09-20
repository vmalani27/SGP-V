#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# provision.sh — Dynamic provisioner for testing matrix VMs
# ──────────────────────────────────────────────────────────────
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DOCKER_VER="${1:-}"
CONTAINERD_VER="${2:-}"
SYSBOX_VER="${3:-}"

echo "==> Inputs: Docker: '${DOCKER_VER}', containerd: '${CONTAINERD_VER}', Sysbox: '${SYSBOX_VER}'"

echo "==> Configuring resilient DNS..."
systemctl restart systemd-resolved || true
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

echo "==> Installing prerequisites..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release jq kmod apt-transport-https rsync

# Configure Docker APT repository
echo "==> Configuring Docker APT repository..."
install -m 0755 -d /etc/apt/keyrings
rm -f /etc/apt/keyrings/docker.gpg
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes --batch -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y

# Resolve exact package versions from apt-cache if partial versions are supplied
if [[ -n "$DOCKER_VER" && "$DOCKER_VER" != *":"* ]]; then
  RESOLVED_DOCKER=$(apt-cache madison docker-ce | grep "$DOCKER_VER" | head -n1 | awk '{print $3}' || true)
  if [[ -n "$RESOLVED_DOCKER" ]]; then
    echo "==> Resolved Docker CE version: $RESOLVED_DOCKER"
    DOCKER_VER="$RESOLVED_DOCKER"
  fi
fi

if [[ -n "$CONTAINERD_VER" && "$CONTAINERD_VER" != *"~"* ]]; then
  RESOLVED_CONTAINERD=$(apt-cache madison containerd.io | grep "$CONTAINERD_VER" | head -n1 | awk '{print $3}' || true)
  if [[ -n "$RESOLVED_CONTAINERD" ]]; then
    echo "==> Resolved containerd.io version: $RESOLVED_CONTAINERD"
    CONTAINERD_VER="$RESOLVED_CONTAINERD"
  fi
fi

# Resolve and install exact versions
echo "==> Installing Docker CE and containerd.io ($DOCKER_VER / $CONTAINERD_VER)..."
if [[ -n "$DOCKER_VER" ]]; then
  DOCKER_INSTALL_ARGS="docker-ce=${DOCKER_VER} docker-ce-cli=${DOCKER_VER}"
else
  DOCKER_INSTALL_ARGS="docker-ce docker-ce-cli"
fi

if [[ -n "$CONTAINERD_VER" ]]; then
  CONTAINERD_INSTALL_ARGS="containerd.io=${CONTAINERD_VER}"
else
  CONTAINERD_INSTALL_ARGS="containerd.io"
fi

apt-get install -y \
  $DOCKER_INSTALL_ARGS \
  $CONTAINERD_INSTALL_ARGS \
  docker-buildx-plugin \
  docker-compose-plugin

# Hold packages to prevent accidental auto-upgrades
apt-mark hold docker-ce docker-ce-cli containerd.io

# Setup user group
usermod -aG docker vagrant

# Stopping Docker before Sysbox installation
echo "==> Stopping Docker for Sysbox setup..."
systemctl stop docker docker.socket || true

# Determine Sysbox Package URL
echo "==> Downloading Sysbox version ${SYSBOX_VER}..."
SYSBOX_URLS=(
  "https://downloads.nestybox.com/sysbox/releases/v${SYSBOX_VER}/sysbox-ce_${SYSBOX_VER}-0.linux_amd64.deb"
  "https://github.com/nestybox/sysbox/releases/download/v${SYSBOX_VER}/sysbox-ce_${SYSBOX_VER}.linux_amd64.deb"
  "https://github.com/nestybox/sysbox/releases/download/v${SYSBOX_VER}/sysbox-ce_${SYSBOX_VER}-0.linux_amd64.deb"
)

DOWNLOADED=0
for URL in "${SYSBOX_URLS[@]}"; do
  echo "Attempting download from: $URL"
  if curl -fsSL --retry 2 --retry-connrefused -o /tmp/sysbox-ce.deb "$URL"; then
    echo "Successfully downloaded Sysbox from $URL"
    DOWNLOADED=1
    break
  fi
done

if [ "$DOWNLOADED" -eq 0 ]; then
  echo "ERROR: Failed to download Sysbox from any known release endpoints."
  exit 1
fi

echo "==> Installing Sysbox..."
apt-get install -y /tmp/sysbox-ce.deb
rm -f /tmp/sysbox-ce.deb

# Register runtime in docker daemon.json
echo "==> Configuring Docker daemon with sysbox-runc runtime..."
mkdir -p /etc/docker
cat <<EOF > /etc/docker/daemon.json
{
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
EOF

echo "==> Restarting and enabling services..."
systemctl daemon-reload
systemctl enable --now sysbox
systemctl restart docker

echo "==> Verifying Sysbox installation..."
docker info | grep -i "sysbox" || echo "WARNING: sysbox runtime not listed in docker info."

echo "==> Provisioning complete."
