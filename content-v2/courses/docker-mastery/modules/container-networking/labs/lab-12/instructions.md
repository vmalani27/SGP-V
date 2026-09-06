# Lab 12: Network Segmentation & Perimeter Security Assessment

## Scenario

You are tasked with designing the container network architecture for a multi-tier microservice stack. The security policy mandates perimeter network isolation: external web traffic must never have direct packet-level access to the internal data persistence layer.

Your assignment is to provision isolated network tiers, position services strictly according to security boundaries, deploy a dual-homed application gateway to bridge tiers, and prove that perimeter isolation prevents unauthorized lateral network access.

This is an independent assessment. You are given operational constraints and acceptance criteria; you must determine the appropriate Docker commands and configurations to achieve the desired state.

---

## Target Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ dmz-net (Ingress Tier)                                      │
│   [ web-proxy (nginx) ] ──────► [ app-gateway ]             │
└────────────────────────────────────┬────────────────────────┘
                                     │  Connected to BOTH tiers
┌────────────────────────────────────┴────────────────────────┐
│ data-net (Persistence Tier)                                 │
│   [ app-gateway ] ────────────► [ cache-db (redis) ]        │
└─────────────────────────────────────────────────────────────┘
(web-proxy must NOT be able to resolve or communicate with cache-db)
```

---

## Operational Specifications & Contract

### 1. Network Tier Provisioning
- Create two user-defined bridge networks:
  - `dmz-net`: Reserved for public ingress and gateway routing.
  - `data-net`: Reserved for internal data storage and caching.
- Both networks must use the standard `bridge` driver.

### 2. Perimeter Service Deployment
- **Web Proxy (`web-proxy`)**:
  - Image: `nginx:alpine`.
  - Network: Connected strictly to `dmz-net`.
  - Port Publishing: Map host port 8080 to container port 80.
- **Cache Store (`cache-db`)**:
  - Image: `redis:alpine`.
  - Network: Connected strictly to `data-net`.
  - Port Publishing: Must **not** publish any host ports.

### 3. Dual-Homed Application Gateway
- **Application Gateway (`app-gateway`)**:
  - Image: `alpine:latest`.
  - Configuration: Must remain actively running in the background.
  - Network Attachment: Must be simultaneously attached to both `dmz-net` and `data-net`.

### 4. Network Isolation & Service Discovery Contract
- `app-gateway` must be capable of resolving and communicating with `cache-db` on port 6379 and `web-proxy` on port 80 using standard service discovery.
- `web-proxy` must be strictly isolated from `data-net`. Any attempt from `web-proxy` to resolve or transmit packets to `cache-db` must fail.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Network Tiers** | `dmz-net` and `data-net` exist as user-defined bridge networks. |
| **Proxy Deployment** | `web-proxy` runs exclusively on `dmz-net` with port 8080 mapped to port 80. |
| **Cache Deployment** | `cache-db` runs exclusively on `data-net` with 0 host ports exposed. |
| **Dual-Homed Gateway** | `app-gateway` is actively running and connected to both `dmz-net` and `data-net`. |
| **Inter-Service Routing** | `app-gateway` reaches `cache-db:6379` and `web-proxy:80`. |
| **Perimeter Defense** | `web-proxy` cannot resolve or reach `cache-db`. |
