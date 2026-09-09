# Lab 1: Host Access & Container Execution Assessment

## Scenario

You have provisioned a new Linux development environment where the Docker engine is running. However, your developer account currently lacks the permissions required to communicate with the daemon socket.

Your objective is to diagnose the communication failure, configure non-root user permissions, examine the locally available image cache, and execute a container that produces a deterministic greeting for host inspection.

This is an independent assessment. You are provided with operational constraints and acceptance criteria; you must determine the appropriate Linux and Docker CLI commands to achieve the desired state.

---

## Operational Specifications & Contract

### 1. Daemon Diagnosis & Permission Configuration
- Diagnose the root cause of Docker daemon connection errors when executing unprivileged commands.
- Grant the user `student` membership in the `docker` system group so Docker CLI commands can communicate with `/var/run/docker.sock`.

### 2. Image Cache Inspection
- Determine the standard CLI command used to query locally stored container images.

### 3. Container Execution & Output Verification
- Deploy a container named `alpine-container` using the `alpine:latest` base image.
- Configure the container process to output the exact string `GREETING_FROM_ALPINE` to standard output.
- Ensure the container object remains available on the host (not automatically purged) so its logs and configuration can be evaluated.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Daemon Diagnosis** | Identify the socket permission model preventing daemon access. |
| **User Authorization** | User `student` belongs to the `docker` system group. |
| **Cache Query** | Identify the command that lists locally cached images. |
| **Container Execution** | Container `alpine-container` exists, runs `alpine:latest`, and emitted `GREETING_FROM_ALPINE`. |
