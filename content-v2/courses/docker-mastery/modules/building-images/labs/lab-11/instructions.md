# Lab 11: Capstone Assessment — Production Image Engineering

## Scenario

An uncontainerized microservice repository is provisioned in your home workspace at `~/inventory-service`. The application is written in TypeScript using Express and structured according to production microservice standards.

The repository currently contains development configurations, unit test suites, local debug logs, and sensitive environment credentials. Your assignment is to take ownership of this codebase and engineer a hardened, production-grade container deployment that adheres to enterprise security and operational requirements.

This is an independent practical assessment. You are given the operational specifications and acceptance criteria; you must determine the appropriate implementation and verify the result.

---

## Workspace Structure

The project is located at `~/inventory-service`:

```text
inventory-service/
├── .env                    # Sensitive environment credentials (must NOT leak)
├── package.json            # Application dependencies & scripts
├── tsconfig.json           # TypeScript compiler configuration (outDir: ./dist)
├── logs/                   # Local diagnostic logs
│   └── debug.log
├── src/                    # Application source code
│   └── server.ts           # HTTP server and endpoints
└── tests/                  # Development unit test suite
    └── server.test.ts
```

---

## Operational Specifications & Contract

### 1. Build Context Boundaries
- Sensitive credentials (`.env`), test suites (`tests`), debug logs (`logs`), local dependencies (`node_modules`), and build output (`dist`) must be explicitly excluded from entering the Docker build context.

### 2. Multi-Stage Architecture
Author a multi-stage `Dockerfile` in `~/inventory-service` using the official `node:20-alpine` image:
- **Builder Stage (`builder`)**:
  - Compiles the TypeScript application into `./dist` using declared dependencies.
- **Production Stage**:
  - Operates from the working directory `/usr/src/app`.
  - Installs strictly production dependencies without development tooling.
  - Purges package manager cache archives to prevent layer bloat.
  - Copies only the compiled `dist/` directory from the builder stage.

### 3. Security & Process Privileges
- The container must execute with least privilege under the unprivileged `node` user identity.
- The image must document exposure of port `8080`.
- The process must bootstrap by invoking `dist/server.js` directly with the Node runtime without an intermediary process manager.

### 4. Image Contract
- Register the final production image under the repository tag `inventory-service:prod`.
- The production image must remain under the maximum size budget of **210 MB**.

### 5. Runtime Deployment & Audit Contract
- Run a detached container named `inventory-api` with host port 8080 mapped to container port 8080.
- The HTTP endpoint `http://localhost:8080/health` must respond with HTTP 200 and report healthy status (`{"status":"healthy"}`).
- The process inside the running container must execute as `node`.
- Build-time compilation tooling (`tsc`) and local credentials (`.env`) must not be accessible anywhere in the running container filesystem.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Context Hygiene** | `.dockerignore` excludes `.env`, `tests`, `logs`, `node_modules`, and `dist`. |
| **Multi-Stage Structure** | `Dockerfile` defines an intermediate `builder` stage and extracts only `dist/`. |
| **Production Dependencies** | Production layer contains only runtime dependencies; package manager cache is cleaned. |
| **Least Privilege** | Container execution drops root privileges (`USER node`). |
| **Image Budget** | `inventory-service:prod` image size is under 210 MB. |
| **Runtime Health** | `inventory-api` container is running and responds with HTTP 200 on `/health`. |
| **Security Isolation** | Neither `./node_modules/.bin/tsc` nor `.env` exists in the running container. |
