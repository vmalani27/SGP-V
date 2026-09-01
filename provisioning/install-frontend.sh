#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# install-frontend.sh — Build and run the Next.js production container
# ──────────────────────────────────────────────────────────────
set -euo pipefail

FRONTEND_DIR="/opt/sgp/next-app"
IMAGE_NAME="labops-frontend"
CONTAINER_NAME="labops-frontend"
VOLUME_NAME="labops-frontend-content"

echo "==> Ensuring frontend source is available..."
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "ERROR: next-app source not found at $FRONTEND_DIR"
  exit 1
fi

echo "==> Dynamically detecting host gateway IP..."
HOST_IP=$(ip route show | grep -i default | awk '{ print $3 }' | head -n 1)
if [ -z "$HOST_IP" ]; then
  HOST_IP="10.0.2.2"
fi
echo "==> Detected host IP: $HOST_IP"

echo "==> Preparing environment variables for Next.js build..."
# Helper to check if file is UTF-16 and convert it to UTF-8
convert_env_file() {
  local src="$1"
  local dest="$2"

  if file "$src" | grep -q "UTF-16"; then
    echo "  - Converting $src from UTF-16 to UTF-8"
    iconv -f UTF-16 -t UTF-8 "$src" > "$dest"
  else
    cp "$src" "$dest"
  fi

  # Strip Windows carriage returns (\r) and any UTF-8 BOM if present
  sed -i 's/\r$//' "$dest"
  sed -i '1s/^\xEF\xBB\xBF//' "$dest"
}

# If a dev env config exists, copy and prepare it.
# Otherwise, fall back to cleaning the existing .env.local.
if [ -f "/opt/sgp/environments/dev/frontend/.env.dev" ]; then
  convert_env_file "/opt/sgp/environments/dev/frontend/.env.dev" "$FRONTEND_DIR/.env.local"
  echo "  - Copied dev .env.dev config to .env.local for Next.js build"
elif [ -f "$FRONTEND_DIR/.env.local" ]; then
  convert_env_file "$FRONTEND_DIR/.env.local" "$FRONTEND_DIR/.env.local.tmp"
  mv "$FRONTEND_DIR/.env.local.tmp" "$FRONTEND_DIR/.env.local"
  echo "  - Prepared existing .env.local for Next.js build"
fi

REMOTE_FRONTEND="ghcr.io/vmalani27/sgp-v/frontend:dev"
echo "==> Fetching Next.js frontend production image..."
if docker pull "$REMOTE_FRONTEND" 2>/dev/null; then
  docker tag "$REMOTE_FRONTEND" "${IMAGE_NAME}:prod"
  echo "  - [✓] Pulled pre-built image from GHCR ($REMOTE_FRONTEND)"
else
  echo "  - [!] Could not pull from GHCR, building locally..."
  docker build \
    -t "${IMAGE_NAME}:prod" \
    --target runtime \
    --build-arg NEXT_PUBLIC_API_BASE_URL=https://labops-dev.onrender.com \
    -f "$FRONTEND_DIR/Dockerfile" \
    "$FRONTEND_DIR"
fi

echo "==> Creating persistent Docker volumes..."
docker volume create "$VOLUME_NAME" >/dev/null

echo "==> Removing existing frontend container if present..."
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "==> Starting ${CONTAINER_NAME} production container in the background..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 3000:3000 \
  -v "${VOLUME_NAME}:/app/.content" \
  -e NODE_ENV=production \
  -e HOSTNAME="0.0.0.0" \
  -e PORT=3000 \
  -e NEXT_PUBLIC_API_BASE_URL=https://labops-dev.onrender.com \
  -e BACKEND_API_URL=https://labops-dev.onrender.com \
  -e NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:8001 \
  -e NEXT_PUBLIC_ORCHESTRATOR_SECRET=local-dev-super-secret \
  -e CONTENT_LOCAL_DIR=/app/.content \
  --add-host "localhost.floci.io:$HOST_IP" \
  --restart always \
  "${IMAGE_NAME}:prod"

echo "==> labops-frontend production server running inside the VM on port 3000."
echo "==> Exposed via forwarded port on host at http://localhost:3000"
echo "==> Logs:      vagrant ssh -c 'docker logs -f ${CONTAINER_NAME}'"
echo "==> Frontend deployment completed successfully."