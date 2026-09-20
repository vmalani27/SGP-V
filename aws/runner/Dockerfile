# ──────────────────────────────────────────────────────────────
# GitHub Actions Self-Hosted Runner Dockerfile
# ──────────────────────────────────────────────────────────────
# Target Runtime: AWS ECS Fargate / EC2 / Local Docker
# Base Image: Ubuntu 22.04 LTS
# ──────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
ENV DEBIAN_FRONTEND=noninteractive

# Install essential build tools, container tools, and AWS CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    git \
    tar \
    unzip \
    zip \
    sudo \
    build-essential \
    python3 \
    python3-pip \
    docker.io \
    awscli \
    && rm -rf /var/lib/apt/lists/*

# Create runner directory & non-root user with sudo permissions
RUN useradd -m -s /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && mkdir -p /actions-runner

WORKDIR /actions-runner

# Download, validate SHA256, & extract GitHub Actions Runner binary
RUN curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
    https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz \
    && echo "${RUNNER_SHA256}  actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" | sha256sum -c \
    && tar xzf actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz \
    && rm actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz \
    && ./bin/installdependencies.sh

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && chown -R runner:runner /actions-runner

USER runner

ENTRYPOINT ["./entrypoint.sh"]
