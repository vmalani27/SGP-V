# Lab 10: Multi-Stage Builds Assessment

## Scenario

An Express TypeScript microservice is provisioned in your home directory at `~/order-service`. The repository includes a legacy single-stage Dockerfile (`Dockerfile.single`) that compiles TypeScript in place. This approach creates container bloat and leaves development tooling inside the deployed artifact.

Your objective is to assess and eliminate this bloat by establishing workspace context boundaries, measuring the baseline image footprint, and authoring a hardened, production-grade multi-stage `Dockerfile`.

---

## Workspace Structure

The service is located at `~/order-service`:

```text
order-service/
├── .dockerignore
├── Dockerfile.single       # Baseline single-stage build specification
├── package.json            # Service manifests & dependencies
├── tsconfig.json           # TypeScript compilation configuration
└── src/
    ├── api/
    │   └── order-routes.ts # HTTP routing and health endpoints
    ├── domain/
    │   └── order-service.ts# Business domain logic
    └── server.ts           # Service bootstrap
```

---

## Operational Requirements & Contract

### 1. Workspace Context Boundaries
- The project dependency tree and package lockfile must be initialized in the local workspace.
- Build context exclusion rules must prevent local dependency directories (`node_modules`) and compiled output directories (`dist`) from transferring to the Docker daemon during builds.

### 2. Baseline Image
- The baseline image must be built from `~/order-service/Dockerfile.single` and registered with the tag `order-service:single`.

### 3. Production Multi-Stage Dockerfile Specification
The primary `Dockerfile` in `~/order-service` must implement a multi-stage architecture fulfilling the following contract:

- **Intermediate Stage (`builder`)**:
  - Base image: `node:20-alpine` with stage identifier `builder`.
  - Installs all dependencies declared in the project manifests.
  - Compiles TypeScript source files from `src/` to `dist/`.

- **Production Runtime Stage**:
  - Base image: `node:20-alpine`.
  - Working directory: `/usr/src/app`.
  - Installs strictly production dependencies (excluding development dependencies).
  - Purges package manager cache archives to prevent layer inflation.
  - Extracts only the compiled `dist/` directory from the `builder` stage.
  - Executes as the unprivileged `node` user.
  - Documents exposed port `3000`.
  - Starts the service by executing `dist/server.js` directly with the Node runtime without an intermediary process manager.

### 4. Production Image Build
- The resulting multi-stage image must be tagged as `order-service:multi`.
- The final image size must reflect the exclusion of compilers and development dependencies, remaining significantly smaller than the single-stage baseline.

### 5. Runtime Deployment & Security Audit
- The deployed container must be named `order-api` with host port 3000 mapped to container port 3000.
- The service must report healthy status with HTTP 200 on endpoint `/api/health`.
- The running process must execute under unprivileged user identity (`node`).
- Development tooling, specifically the TypeScript compiler executable (`tsc`), must be completely absent from the container filesystem.

---

## Success Criteria

| Evaluation Check | Acceptance Criteria |
| :--- | :--- |
| **Workspace Hygiene** | Lockfile generated; `.dockerignore` excludes `node_modules` and `dist`. |
| **Baseline Registry** | `order-service:single` image exists in the local daemon. |
| **Multi-Stage Architecture** | `~/order-service/Dockerfile` defines separate builder and runtime stages. |
| **Least Privilege & Hygiene** | Production stage drops root permissions (`USER node`) and cleans package caches. |
| **Image Size Threshold** | `order-service:multi` image size is under 210 MB. |
| **Runtime Health** | `order-api` container responds with HTTP 200 on `/api/health`. |
| **Attack Surface Elimination**| `./node_modules/.bin/tsc` does not exist inside the running container. |
