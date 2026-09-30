# ──────────────────────────────────────────────────────────────
# GitHub Actions Self-Hosted Runner Dockerfile with Kaniko
# ──────────────────────────────────────────────────────────────
FROM gcr.io/kaniko-project/executor:v1.23.2-debug AS kaniko-src

FROM public.ecr.aws/i9t1l0m7/vmalani27/labops-base:ubuntu-22.04

ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
ENV DEBIAN_FRONTEND=noninteractive

# 1. Install essential system dependencies and AWS CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    git \
    tar \
    unzip \
    zip \
    sudo \
    awscli \
    && rm -rf /var/lib/apt/lists/*

# 2. Copy Kaniko binaries and configs into /usr/local/kaniko to avoid text file busy when building self-runner
COPY --from=kaniko-src /kaniko /usr/local/kaniko

# Symlink to /kaniko for backwards compatibility
RUN mkdir -p /kaniko && ln -sf /usr/local/kaniko/executor /kaniko/executor

ENV PATH="${PATH}:/usr/local/kaniko:/kaniko"
ENV DOCKER_CONFIG="/usr/local/kaniko/.docker"
ENV HOME="/root"

# 3. Create runner directory & non-root user with sudo permissions
RUN useradd -m -s /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && mkdir -p /actions-runner/_work \
    && chown -R runner:runner /actions-runner /usr/local/kaniko \
    && chmod -R 777 /actions-runner /usr/local/kaniko /root

WORKDIR /actions-runner
USER runner

# 4. Download, validate SHA256, & extract GitHub Actions Runner
RUN curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
    https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz \
    && echo "${RUNNER_SHA256}  actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" | sha256sum -c \
    && tar xzf actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz \
    && rm actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz

# 5. Copy entrypoint script
COPY --chown=runner:runner entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]