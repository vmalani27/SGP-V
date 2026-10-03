# syntax=docker/dockerfile:1

###############################################################################
# builder - compile wheels and install dependencies
###############################################################################
FROM python:3.12-alpine AS builder

WORKDIR /build

# Alpine's build dependencies for compiling Python packages via musl
RUN apk add --no-cache \
    build-base \
    libffi-dev

COPY requirements.txt .
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

###############################################################################
# base - runtime dependencies and user setup
###############################################################################
FROM python:3.12-alpine AS base

WORKDIR /app

# Install lightweight runtime requirements via apk
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    bash

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Create the docker group securely and create the non-root orchestrator user
# We use a fallback if GID 999 is already taken by Alpine's internal system groups
RUN if ! getent group docker; then addgroup -g 999 docker 2>/dev/null || addgroup docker; fi && \
    adduser -u 1001 -G docker -s /bin/bash -D orchestrator

EXPOSE 8000

###############################################################################
# dev - local development stage (hot-reloading enabled)
###############################################################################
FROM base AS dev
USER root
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

###############################################################################
# runtime - production runtime stage
###############################################################################
FROM base AS runtime

COPY --chown=orchestrator:docker app/ ./app/

# Switch to the non-root orchestrator user (who belongs to the 'docker' group)
USER orchestrator

# Single process with uvloop for low-latency WebSocket / PTY throughput
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "uvloop", "--ws", "websockets", "--proxy-headers"]