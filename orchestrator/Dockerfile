# syntax=docker/dockerfile:1

###############################################################################
# builder - compile wheels and install dependencies
###############################################################################
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

###############################################################################
# base - runtime dependencies and user setup
###############################################################################
FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Create non-root runner and map docker group (GID 999 is standard; adjust to match host/VM)
RUN groupadd -g 999 docker && \
    useradd -u 1001 -g docker -s /bin/bash -m orchestrator

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

USER orchestrator

# Single process with uvloop for low-latency WebSocket / PTY throughput
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "uvloop", "--ws", "websockets", "--proxy-headers"]