#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# test_compatibility.sh — Executes nested docker compatibility checks
# ──────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== LADDER 1: Basic Sysbox verification ==="
# Test that a basic container can run under the sysbox-runc runtime
docker run --runtime=sysbox-runc --rm ubuntu:$(lsb_release -rs) uname -a

echo "=== Creating Nested systemd + Docker test image ==="
# We construct a minimal Dockerfile that matches SGP's architecture:
# It runs systemd as PID 1 and starts nested Docker as a service.
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

cat <<'EOF' > Dockerfile
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
ENV container=docker

# Install systemd, sudo, and basic tools
RUN apt-get update && apt-get install -y \
    systemd \
    systemd-sysv \
    sudo \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Set systemd target
RUN systemctl set-default multi-user.target

# Install Docker CE inside the container
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu jammy stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update && apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Enable Docker daemon inside systemd
RUN systemctl enable docker.service

ENTRYPOINT ["/sbin/init"]
EOF

echo "Building test image..."
docker build -t labops-compat-test:latest .

echo "=== LADDER 2: Nested Docker and systemd Verification ==="
# Run the outer container with sysbox-runc
CONTAINER_NAME="compat-test-container"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d --runtime=sysbox-runc --name "$CONTAINER_NAME" labops-compat-test:latest

# Function to clean up on script exit
cleanup() {
  echo "Cleaning up test container and files..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Wait for systemd to start and dockerd inside to be responsive
echo "Waiting for nested Docker daemon to start..."
timeout=60
start_time=$(date +%s)
while true; do
  if docker exec "$CONTAINER_NAME" docker info >/dev/null 2>&1; then
    echo "Nested Docker daemon is ready!"
    break
  fi
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))
  if [ "$elapsed" -ge "$timeout" ]; then
    echo "ERROR: Nested Docker daemon failed to start within ${timeout}s."
    echo "=== Container logs ==="
    docker logs "$CONTAINER_NAME" || true
    echo "=== Systemd status inside container ==="
    docker exec "$CONTAINER_NAME" systemctl status docker || true
    exit 1
  fi
  sleep 1
done

# Run hello-world inside the nested container
echo "Running hello-world in nested Docker..."
docker exec "$CONTAINER_NAME" docker run --rm hello-world

echo "=== LADDER 3: BuildKit Verification ==="
# Test BuildKit nested build
echo "Testing BuildKit image build inside nested Docker..."
docker exec "$CONTAINER_NAME" sh -c "
  mkdir -p /tmp/build-test && \
  printf 'FROM alpine\nRUN echo \"Success! BuildKit works inside nested Sysbox container.\"\n' > /tmp/build-test/Dockerfile && \
  docker build --no-cache -t nested-build-success -f /tmp/build-test/Dockerfile /tmp/build-test
"

echo "=== ALL COMPATIBILITY TESTS PASSED SUCCESSFULLY ==="
