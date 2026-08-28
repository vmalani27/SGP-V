#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# install-sysbox.sh — Install Sysbox CE and configure runtime
# ──────────────────────────────────────────────────────────────
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

SYSBOX_VERSION="0.7.0"
SYSBOX_URL="https://github.com/nestybox/sysbox/releases/download/v${SYSBOX_VERSION}/sysbox-ce_${SYSBOX_VERSION}.linux_amd64.deb"

echo "==> Downloading Sysbox CE ${SYSBOX_VERSION}..."
curl -fsSL --retry 3 --retry-connrefused -o /tmp/sysbox-ce.deb "$SYSBOX_URL"

echo "==> Stopping Docker before Sysbox installation..."
systemctl stop docker docker.socket || true

echo "==> Installing Sysbox CE..."
apt-get install -y /tmp/sysbox-ce.deb
rm -f /tmp/sysbox-ce.deb

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

echo "==> Reloading and starting systemd services..."
systemctl daemon-reload
systemctl enable --now sysbox
systemctl restart docker

echo "==> Verifying runtime availability..."
docker info | grep -i "sysbox"

echo "==> Sysbox CE ${SYSBOX_VERSION} installed successfully."
