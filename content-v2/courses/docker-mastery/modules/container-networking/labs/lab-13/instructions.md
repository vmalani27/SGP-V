# Lab 13: Capstone Assessment — Composing Resilient Multi-Tier Applications

## Scenario

You are responsible for orchestrating a microservice architecture consisting of a public reverse proxy, an application backend, and an in-memory cache.

Manual container commands have created operational friction and deployment failures due to race conditions during container boot. You must declare the entire multi-tier system as code in a single Compose file, enforce perimeter network segmentation, and guarantee deterministic startup ordering using container health checks.

This is an independent assessment. You are provided the operational specifications and acceptance criteria; you must author the configuration and execute the deployment without guided instruction.

---

## Target Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ frontend-tier                                               │
│   [ proxy (nginx) ] ────────► [ api (backend) ]             │
└──────────────────────────────────────┬──────────────────────┘
                                       │  Connected to BOTH tiers
┌──────────────────────────────────────┴──────────────────────┐
│ backend-tier                                                │
│   [ api (backend) ] ────────► [ cache (redis: healthy) ]    │
└─────────────────────────────────────────────────────────────┘
(proxy must NOT be able to resolve or route packets to cache)
```

---

## Operational Specifications & Contract

### 1. Workspace & Specification File
- Implement the deployment specification in `~/order-stack/compose.yaml`.

### 2. Network Tier Definitions
- Define two user-defined bridge networks:
  - `frontend-tier`: Public ingress communication between the proxy and API backend.
  - `backend-tier`: Private internal network for backend data persistence.

### 3. Service Declarations

- **`cache`**:
  - Image: `redis:alpine`.
  - Network: Connected strictly to `backend-tier`.
  - Port Publishing: Must **not** publish any ports to the host machine.
  - Healthcheck: Must verify Redis service readiness using `redis-cli ping`.
- **`api`**:
  - Image: `alpine:latest`.
  - Networks: Attached to both `frontend-tier` and `backend-tier`.
  - Process: Must maintain an active process to remain continuously running.
  - Startup Coordination: Must declare a dependency on `cache` with `condition: service_healthy` to prevent startup before the cache is responsive.
- **`proxy`**:
  - Image: `nginx:alpine`.
  - Network: Connected strictly to `frontend-tier`.
  - Port Publishing: Map host port `8080` to container port `80`.

### 4. Runtime & Verification Contract
- The entire stack must be launched and managed in detached mode via Docker Compose.
- All three services must report `running` status, with `cache` specifically reporting `healthy`.
- Public HTTP traffic on `http://localhost:8080` must return HTTP 200 from the proxy.
- Perimeter security must be maintained: attempts by the proxy container to communicate with `cache` must be blocked by network isolation.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Compose Syntax** | `compose.yaml` validates against the Docker Compose specification. |
| **Network Segmentation** | Services are placed on `frontend-tier` and `backend-tier` according to least privilege. |
| **Healthcheck Gating** | `api` startup is conditioned on `cache` achieving `service_healthy`. |
| **Ingress Publishing** | `proxy` serves traffic on host port 8080; `cache` exposes 0 host ports. |
| **Stack Health** | All containers run in detached mode with healthy status. |
| **Perimeter Isolation** | Network isolation prevents `proxy` from reaching `cache`. |
