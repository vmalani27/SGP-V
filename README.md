# LabOps — DevOps Learning Platform

A KodeKloud-style platform for learning Git and Docker through hands-on interactive labs with real terminal environments.

## Architecture

```
                          ┌─────────────────────── HOST · docker compose ───────────────────────┐
                          │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
                          │  │ sgp-frontend │─→│ sgp-backend  │─→│  Firebase    │              │
                          │  │  Next.js:3000│  │ FastAPI:8000 │  │  Auth + DB   │              │
                          │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  ┌────────┐ │
                          │  bootstrap│ REST + WS     │ Firestore        │ firebase │  sgp-   │ │
                          │         └─────────┐      └── host.docker.internal:8001      │worker  │ │
                          └───────────────────┼─────────────────────────────────────────│:8002   │ │
                                              ▼                                        │ S3→FS  │ │
                                              │                                        └───┬────┘ │
                                              ▼                                            │ seed
                          ┌──────────────┐                                            ┌────▼───────┐
                          │  S3 bucket   │                                            │ Firebase   │
                          │  (Floci dev) │◀──────────────────────────────────────────│ Firestore  │
                          │ latest.json +│   download + verify artifact_sha256        └────────────┘
                          │ published/…  │
                          └──────────────┘
                                   ▲
                                   │ CI (publish-content) validate → generate_manifest → upload
                          ┌────────┴─────┐   ┌──────────────────────────────────────────────────────┐
                          │              │   │  VAGRANT VM · Ubuntu Server 22.04 · VMware/VirtualBox│
                          │              │   │  ┌──────────────────┐      ┌─────────────────────┐   │
                          │              │   │  │  sgp-orchestrator│───→│  Docker Engine       │   │
                          │              │   │  │  FastAPI :8001   │     │  + Sysbox            │   │
                          │              │   │  │  (guest :8000)   │     │  (lab containers)    │   │
                          │              │   │  └──────────────────┘      └─────────────────────┘   │
                          └──────────────┘   └──────────────────────────────────────────────────────┘
```

The docker compose stack (`frontend`, `backend`, `worker`, `floci`) runs on the
host; the **orchestrator runs inside a Vagrant VM** (`Vagrantfile`, provisioned by
`provisioning/`) — the VM's own Docker + Sysbox engine hosts the lab containers,
and the VM's guest `:8000` is host-forwarded to `:8001` where the backend reaches it.

| Service | Port | Responsibility |
|---------|------|----------------|
| **sgp-frontend** | 3000 | UI, auth flow, learning wizard, xterm.js terminal, **content bootstrap** (downloads the published artifact from S3, verifies it, extracts it locally, and serves course content from local files) |
| **sgp-backend** | 8000 | **Pure metadata + data-location API**: Firebase auth, course catalog/TOC from Firestore, enrollment/progress, lab lifecycle proxy, and the content version handshake (`GET /api/v1/content/version`). Reads **no content files**. |
| **sgp-orchestrator** | 8001 | Docker container lifecycle, command execution, WebSocket terminal — runs **inside the Vagrant VM** (guest 8000, host-forwarded to 8001) |
| **sgp-worker** | 8002 | **S3-only**: downloads the published content artifact, validates it, seeds course metadata to Firestore |

> The backend no longer serves course files. Course metadata lives in Firestore
> (seeded by the worker), the content bytes live in the S3 bucket and, once
> downloaded, in the frontend's local content dir. For the full plan see
> [docs/CLIENT-APP-PLAN.md](docs/CLIENT-APP-PLAN.md) and
> [docs/CONTENT-PIPELINE.md](docs/CONTENT-PIPELINE.md).

## What Each Component Does

### Frontend (`next-app/`)
- Login/register with Firebase Authentication
- Course catalog and enrollment
- Chapter viewer with theory + quizzes
- Lab viewer with task runner, WebSocket terminal, and submit flow
- Runs YAML-driven lab tasks: multiple choice, terminal commands, port checks
- Success animation + Submit Lab modal (records completion, destroys container)
- **Content bootstrap** (`lib/content-local.ts`): on first content request it
  calls `GET /api/v1/content/version`, compares against a local version marker,
  and if changed downloads `published/{version}/content.tar.gz` from S3,
  verifies its sha256 against the handshake, extracts into `/app/.content/data`,
  and writes the marker. Subsequent requests are a no-op.
- Serves chapters / lab instructions / lab config from the local content dir via
  same-origin `/api/local-content/*` routes — no backend content calls.
- Drives the learning flow (modules → chapters → labs)

### Backend (`backend/`)
- Verifies Firebase ID tokens (Bearer auth)
- Syncs user profiles to Firestore (`users` collection)
- Tracks enrollment and progress in Firestore (`enrollments` collection)
- Serves the **course catalog + TOC from Firestore** (`GET /api/v1/courses`, `GET /api/v1/courses/{id}`)
- Exposes the **content version handshake**: `GET /api/v1/content/version` →
  `{version, download_url, artifact_sha256}` derived from the worker-persisted
  `contentVersion`/`artifact_sha256` in Firestore + a configured public base URL
- Proxies lab lifecycle to orchestrator (start, stop, resume, restart, destroy, exec)
  — the **lab environment config and task validation specs are supplied by the
  client** in the request bodies; the backend never reads `lab.yaml`
- Proxies the terminal WebSocket: browser connects to the backend (`/api/v1/labs/ws/lab`), the backend bridges frames to the orchestrator's internal `/ws/terminal` — the orchestrator address is never exposed to the browser and the JWT is sent as a first-message handshake, not in the URL
- Validates lab task answers server-side (exec in container — answers never leave the container)
- Tracks chapter and lab completion in Firestore (`progress` + `labsProgress`)

### Orchestrator (`orchestrator/` — runs inside the Vagrant VM)
- Runs on the VM (see `Vagrantfile`: synced folder `./orchestrator → /opt/sgp/orchestrator`,
  guest `:8000` → host `:8001`, provisioned by `provisioning/install-{docker,sysbox,orchestrator}.sh`
  and `provisioning/build-lab-images.sh`)
- Creates Sysbox Docker containers for lab environments (labelled `com.sgp.user_id` / `course_id` / `lab_id`)
- Runs arbitrary commands inside containers (`POST /labs/{id}/exec`, supports a `user` field)
- Provides WebSocket terminal (`/ws/terminal`, JWT first-message handshake) with tmux persistence — the browser connects via the backend proxy
- Source of truth for sessions: `GET /labs/by_key` recovers a live container from its labels after a restart
- Resizes the remote PTY to match the client (`resize` frames), so terminals stay in sync
- Auto-destroys labs after timeout
- Zero content knowledge — reads no course files

### Worker (`worker/`)
- **S3-only** — never reads a mounted `content-v2`. On every cycle:
  1. `download_content()` — fetch `latest.json`, compare `version` with the
     already-seeded `contentVersion`; if changed, download the tarball, verify
     `artifact_sha256` + the per-file manifest, and extract into the writable
     volume (`/data/content`). Integrity failures raise — a corrupt download
     never seeds silently.
  2. `validate_all()` — schema checks on the downloaded artifact (errors block
     seeding; warnings like skeleton labs do not).
  3. `sync_courses()` — **full reconciliation**: rebuilds the derived document
     and rewrites Firestore whenever the stored doc differs, so stale derived
     fields (e.g. `totalChapters: 0`) can never persist. `contentHash` is kept
     for cheap skip checks but never gates a write. Orphaned courses are deleted.
- Runs on a polling loop (300s interval); `POST /sync` forces a cycle; `GET /status`
  shows `published_version` and the last result
- **Does NOT do anything at lab runtime** — no Docker socket, no container/image
  management. Base lab images (`sgp-lab-ubuntu/docker/git`) are built from
  `orchestrator/lab-images/` and ensured (pull/build) by the orchestrator at start.

### Content (`content-v2/`)
Single source of truth for all course data. **Published to S3** (CI on push to
`dev`, or manually via `scripts/`), then downloaded by the worker (metadata) and
by the frontend (bytes).

```
content-v2/
  index.json                              # course catalog
  environments/
    {name}.yaml                           # shared environment definitions (e.g. docker-basic)
  courses/{id}/
    course.yaml                           # TOC — module references
    modules/{module-id}/
      module.yaml                         # module metadata + ordered `items`
      chapters/{chapter-id}.md            # theory content (markdown)
      labs/
        {lab-id}/
          lab.yaml                        # tasks + environment reference
          instructions.md                 # lab instructions (markdown)
```

Canonical lab format (per-lab directory):
```yaml
id: lab-1
title: Hello World Container
environment: docker-basic          # references environments/docker-basic.yaml
tasks:
  - id: count-images
    prompt: "How many images are available?"
    type: multiple_choice
    validation:
      expected_answer: "2"
```
Lab config lives at `labs/{lab-id}/lab.yaml`, instructions at `labs/{lab-id}/instructions.md`.
The environment is always a string reference to a shared `environments/{name}.yaml`.

> End-to-end reference (file templates, validation, Firestore seeding, publishing,
> authoring workflow): see [docs/CONTENT-PIPELINE.md](docs/CONTENT-PIPELINE.md).

### Validation model
- Two distinct kinds of checks (see CONTENT-PIPELINE §"Answer-based vs state-based"):
  - **Answer-based** — `multiple_choice`. The student's choice is compared to
    `validation.expected_answer`; nothing is executed, so it stays valid
    regardless of later lab state.
  - **State-based** — `terminal_action` (and `port_check`/`file_check`). The
    backend runs `validation.command` in the container and decides from
    `expected_exit_code` (preferred) or matches the output via `match_type`
    (contains/exact/regex/line_count).
- Validation runs server-side; the backend executes the client-supplied `command`
  in the live container via the orchestrator. **No static answers leave the server.**
- `match_type`/`expected_output` are only consulted when `expected_exit_code` is absent.

## Firestore Collections

| Collection | Written by | Document ID | Shape |
|------------|-----------|-------------|-------|
| `courses` | Worker | Course ID (e.g. `git-fundamentals`) | `{id, title, description, level, modules:[{id,title,description,order, items:[{type,id,title}], chapters:[{id,title,description,order}], labs:[{id,title,description,chapterId,order}]}], totalChapters, totalLabs, contentHash, contentVersion, artifact_sha256, updatedAt, createdAt}` (no `slug`/`estimatedHours`) |
| `users` | Backend (on login) | Firebase Auth UID | `enrolledCourses: [courseId, ...]` |
| `enrollments` | Backend (on enroll/progress) | `{uid}_{courseId}` | `progress: {moduleId: {chapterId: "completed"}}` + `labsProgress: {moduleId: {labId: "completed"}}` + `taskResults: {moduleId: {labId: {taskId: {attempts, passed, firstPassedAt?, lastAttemptAt}}}}` (written on every lab task validation; `passed` is sticky, `attempts` counts every check) |

## Content Delivery Model

```
content-v2/ ──CI / scripts──► S3 bucket (Floci dev)     canonical content bytes, public read

S3 ──► worker (cloud) ──► Firestore                     catalog metadata + contentVersion
backend (cloud) = Firestore API: auth, progress, catalog + GET /content/version

frontend (student machine):
    boot: GET /content/version  →  compare local marker
          if changed: download {content.tar.gz} → verify artifact_sha256 → extract
          serve TOC / chapters / lab instructions / lab config from local files
orchestrator: spawns lab containers from the client-supplied env config in `start`
```

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/content/version` | No | `{version, download_url, artifact_sha256}` — the client's bootstrap handshake (no file I/O) |
| `GET /api/v1/courses` | No | Course catalog from Firestore |
| `GET /api/v1/courses/{id}` | No | Course TOC from Firestore (modules/items/chapters/labs) |
| `GET /api/local-content/chapters/{courseId}/{chapterId}` | No | Chapter markdown served from the frontend's **local** content dir |
| `GET /api/local-content/labs/{courseId}/{labId}/instructions` | No | Lab instructions served locally |
| `GET /api/local-content/labs/{courseId}/{labId}/config` | No | Lab YAML config served locally (environment resolved) |
| `GET /api/local-content/labs/{courseId}/{labId}/tasks` | No | Lab tasks served locally |

The old file-serving backend routes (`/api/v1/content/courses`, `/content/chapters`,
`/content/labs/...`) and the `FilesystemProvider` abstraction have been **removed** —
the backend never reads course files.

## Lab Lifecycle API (Backend Proxy)

All lab lifecycle calls are proxied through the backend. The frontend never talks to the orchestrator directly.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET  /api/v1/labs/courses/{id}/labs/{labId}/active` | Yes | Reconnect to existing session (label-based, survives restarts) |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/start` | Yes | Start lab container — body is the **client-supplied** env config `{image, apt_packages, pre_pull, setup}` |
| `GET  /api/v1/labs/courses/{id}/labs/{labId}/status/{sid}` | No | Session status |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/stop/{sid}` | No | Stop container |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/resume/{sid}` | No | Resume container |
| `DELETE /api/v1/labs/courses/{id}/labs/{labId}/{sid}` | Yes | Destroy container |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/exec/{sid}` | No | Run command in container |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/tasks` | Yes | Enrich the **client-supplied** task list (dynamic multiple-choice options resolved in-container) |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/validate` | Yes | Validate a task using the **client-supplied** `task_type` + `validation` spec (exec in container) |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/token/{sid}` | Yes | Refresh WebSocket token |
| `WS /api/v1/labs/ws/lab` | Handshake | Proxied terminal WebSocket (JWT as first message) |

## Quick Start

### Prerequisites
- Docker Engine with Sysbox runtime (`sysbox-runc`)
- Docker Compose v2
- A Firebase project (Auth + Firestore enabled)
- An S3-compatible store reachable at `http://localhost.floci.io:4566` (Floci for dev)
  with a `course-content` bucket — or point the worker/backend at any S3 endpoint
  via env vars

### 1. Configure environment

Create `.env` in the project root:
```env
# Firebase (required)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}

# S3 content store (dev Floci)
CONTENT_PUBLIC_BASE_URL=http://localhost.floci.io:4566/course-content
AWS_ENDPOINT_URL=http://localhost.floci.io:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

### 2. Publish content (once)

The backend and worker are S3-only, so the bucket must have a published artifact
before the stack works. In CI this happens automatically on push to `dev`
(`.github/workflows/publish-content.yml`). Locally:

```bash
# Validate the content (exit 0 required)
python scripts/validate_content.py content-v2/

# Build the deterministic artifact into out/
python scripts/generate_manifest.py content-v2/ out/

# Publish to the S3-compatible store (Floci dev)
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1
aws --endpoint-url http://localhost.floci.io:4566 s3 mb s3://course-content   # once
aws --endpoint-url http://localhost.floci.io:4566 s3 sync out/ s3://course-content/
```

### 3. Start all services

The compose stack runs the frontend, backend, worker, and Floci on the host;
the orchestrator runs in the Vagrant VM:

```bash
docker compose up --build
vagrant up          # provisions + starts the VM (Docker + Sysbox + orchestrator)
```

### 4. Verify the worker syncs

The worker downloads the artifact from S3, validates it, and seeds Firestore on
startup (and every 300s, or immediately via `POST /sync`):

```bash
docker compose logs -f worker
curl http://localhost:8002/status        # status: ok, published_version set
curl http://localhost:8000/api/v1/content/version   # {version, download_url, artifact_sha256}
```

### 5. Build lab images (for orchestrator)

```bash
cd orchestrator/lab-images
docker build -t sgp-lab-ubuntu:latest -f Dockerfile.ubuntu .
docker build -t sgp-lab-docker:latest -f Dockerfile.docker .
docker build -t sgp-lab-git:latest -f Dockerfile.git .
```

### Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000/docs |
| Orchestrator API | http://localhost:8001/docs |
| Worker Status | http://localhost:8002/status |

## Development

All services use hot reload:
- **Frontend**: Next.js dev server + `CHOKIDAR_USEPOLLING=true`
- **Backend**: Uvicorn `--reload` (watches `.py` files)
- **Worker**: Uvicorn `--reload` (watches `.py` files)
- **Orchestrator**: Uvicorn `--reload` inside the Vagrant VM (`./orchestrator` is
  synced to the VM).

### Volume mounts

| Mount | Container | Purpose |
|-------|-----------|---------|
| `frontend_content:/app/.content` | Frontend | Persisted local content store (downloaded artifact + version marker) |
| `worker_content:/data/content` | Worker | Persisted downloaded content (S3 extraction target) |
| `./next-app:/app` | Frontend | Source code hot reload |
| `./backend:/app` | Backend | Source code hot reload |
| `./worker:/app` | Worker | Source code hot reload |
| `./backend/app/core/credentials.json:/app/credentials.json:ro` | Worker | Firebase service account (fallback credential source) |

The orchestrator is **not** in the compose stack: it runs inside the Vagrant VM
against the VM's own Docker socket (VM's `docker.sock` is not the host's).

> The backend has **no** `content-v2` mount — it reads no course files.

### Useful commands

```bash
# Start all services (with build)
docker compose up --build

# Start in background
docker compose up --build -d

# View logs
docker compose logs -f

# View logs for one service
docker compose logs -f backend

# Force a worker sync cycle
curl -X POST http://localhost:8002/sync

# Stop all services
docker compose down

# Stop and remove volumes (fresh content re-download)
docker compose down -v

# Rebuild a single service
docker compose up --build backend
```

## Project Structure

```
SGP_V/
├── docker-compose.yml                 # host stack: frontend, backend, worker, floci (orchestrator runs in the Vagrant VM)
├── Vagrantfile                        # orchestrator VM: Ubuntu 22.04, guest :8000 → host :8001
├── provisioning/                      # VM provisioning: install-{docker,sysbox,orchestrator}.sh, build-lab-images.sh
├── content-v2/                        # Source of truth for all course data (published to S3)
│   ├── index.json                     # Course catalog (v2)
│   ├── environments/                  # Shared environment definitions
│   │   └── docker-basic.yaml          # base_image, pre_pull for DinD labs
│   └── courses/
│       ├── git-fundamentals/
│       │   ├── course.yaml            # TOC — module refs (canonical YAML)
│       │   └── modules/
│       │       ├── git-basics/        # module.yaml + chapters/ + labs/
│       │       ├── branching-history/
│       │       ├── remote-collaboration/
│       │       └── complete-workflow/
│       └── docker-mastery/
│           ├── course.yaml            # TOC — module refs
│           └── modules/
│               ├── docker-fundamentals/   # module.yaml + chapters/ + labs/
│               ├── building-images/ ...
│               ├── container-networking/ ...
│               └── persistent-storage/ ...
├── orchestrator/                      # Docker lab executor (FastAPI) — runs inside the Vagrant VM
│   ├── lab-images/                    # Base image Dockerfiles
│   │   ├── Dockerfile.ubuntu          # sgp-lab-ubuntu: systemd + student user
│   │   ├── Dockerfile.docker          # sgp-lab-docker: + Docker daemon (DinD)
│   │   └── Dockerfile.git             # sgp-lab-git: + git pre-installed
│   ├── app/
│   │   ├── main.py                    # Entry point, lifespan, CORS
│   │   ├── config.py                  # DOCKER_HOST, LAB_PREFIX
│   │   ├── api/
│   │   │   ├── labs.py                # POST /labs, exec, activate, validate
│   │   │   ├── health.py              # GET /health
│   │   │   └── schemas.py             # GET /schemas/yaml, /schemas/sample
│   │   ├── services/
│   │   │   └── docker_service.py      # Docker SDK wrapper (exec supports user)
│   │   ├── models/
│   │   │   └── session.py             # LabSession, LabStatus
│   │   └── websocket/
│   │       └── terminal.py            # WS /ws/terminal (JWT handshake)
│   ├── schemas/                       # Lab YAML reference (sample + JSON schema)
│   │   ├── lab-schema.json            # Validates the canonical flat lab format
│   │   ├── lab-sample.yaml            # Working example of the canonical format
│   │   └── README.md                  # Course author guide
│   ├── Dockerfile
│   └── requirements.txt
├── backend/                           # Metadata API: auth + catalog + progress + lab proxy (FastAPI)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py                  # ORCHESTRATOR_URL, CONTENT_PUBLIC_BASE_URL, JWT_*
│   │   ├── core/
│   │   │   ├── firebase_config.py     # Admin SDK init
│   │   │   ├── credentials.json       # Service account (worker mounts this too)
│   │   │   └── firestore_db.py        # Firestore client
│   │   ├── models/
│   │   │   └── user.py
│   │   ├── routers/
│   │   │   ├── users.py               # User sync, profile, enrollments
│   │   │   ├── courses.py             # Catalog/TOC from Firestore, enroll, progress
│   │   │   ├── content.py             # GET /api/v1/content/version (version handshake only)
│   │   │   └── labs.py                # Lab lifecycle proxy → orchestrator (client-supplied config)
│   │   └── utils/
│   │       └── firebase_util.py       # Token verification
│   ├── Dockerfile
│   └── requirements.txt
├── worker/                            # S3 → validate → seed Firestore (FastAPI)
│   ├── app/
│   │   ├── main.py                    # Background sync loop + /health, /status, /sync
│   │   ├── config.py                  # CONTENT_DIR_S3, S3_*, Firebase init
│   │   ├── validator.py               # v2 schema: index, TOC, lab YAML
│   │   └── seeder.py                  # download_content + full-reconcile sync_courses
│   ├── Dockerfile
│   └── requirements.txt
├── scripts/
│   ├── generate_manifest.py           # Build out/ artifact (deterministic tarball + manifest)
│   └── validate_content.py            # CI/local content validation gate
├── postman/                           # End-to-end API test suite + env (see postman/README.md)
├── out/                               # Local publish output (gitignored)
└── next-app/                          # Frontend (Next.js)
    ├── app/
    │   ├── page.tsx                   # Landing page
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   ├── dashboard/page.tsx
    │   ├── api/local-content/...      # Same-origin routes serving local content
    │   └── courses/[courseId]/...     # Course detail, chapters, labs
    ├── components/                    # Navbar, LabTerminal, LabTaskRenderer, tasks, ...
    ├── lib/
    │   ├── firebase.ts
    │   ├── auth-context.tsx
    │   ├── api.ts
    │   ├── task-types.ts
    │   ├── content-server.ts          # Catalog/TOC helpers (Firestore-backed)
    │   ├── content-local.ts           # Content bootstrap: download/verify/extract + local readers
    │   └── content-types.ts
    ├── Dockerfile
    └── package.json
```

## Environment Variables

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `FIREBASE_CREDENTIALS_JSON` | — | Service account JSON (or use `GOOGLE_APPLICATION_CREDENTIALS`) |
| `CONTENT_PUBLIC_BASE_URL` | — | Public S3 base URL used to build the artifact `download_url` (e.g. `http://localhost.floci.io:4566/course-content`) |
| `ORCHESTRATOR_URL` | `http://orchestrator:8000` | Orchestrator REST base URL (internal) |
| `WS_ORCHESTRATOR_URL` | `ws://localhost:8001` | Orchestrator WS base URL (internal, server-side only — never sent to the browser) |
| `JWT_SECRET` | `dev-only-change-in-production` | Secret for terminal WebSocket handshake tokens |
| `JWT_EXPIRY_MINUTES` | `45` | WebSocket token lifetime |

### Orchestrator

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket path |
| `LAB_PREFIX` | `sgp-lab` | Container name prefix |
| `LAB_TIMEOUT_MINUTES` | `40` | Auto-destroy timeout |

### Worker

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTENT_DIR_S3` | `/data/content` | Writable volume where downloaded content is extracted |
| `S3_BUCKET` | — | Bucket with the published artifact |
| `AWS_ENDPOINT_URL` | — | S3-compatible endpoint (e.g. `http://localhost.floci.io:4566`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | — | S3 credentials |
| `FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `FIREBASE_CREDENTIALS_JSON` | — | Service account JSON (or mount `credentials.json`) |
| `SYNC_INTERVAL_SECONDS` | `300` | Polling interval for content sync |

### Frontend

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend URL the browser uses (default: `http://localhost:8000`) |
| `BACKEND_API_URL` | Backend URL the Next.js server uses for the version handshake (internal) |
| `CONTENT_LOCAL_DIR` | Local content store dir (default: `/app/.content`) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client config |

## Current Status

### Working
- Firebase login/register + user sync
- Course catalog + TOC served from **Firestore** (worker-seeded)
- Enrollment and progress tracking with percentage calculation
- Chapter theory viewer + quiz flow (client-side grading, progress persisted to Firestore)
- **Client-side content bootstrap**: version handshake → download → sha256 verify → local extract → serve (chapters/lab instructions/config come from `/app/.content`, no backend content calls)
- Backend is a pure metadata + data-location API (`GET /api/v1/content/version`); no `content-v2` mount, no `FilesystemProvider`
- Worker is **S3-only** and performs a **full-reconcile** Firestore sync (populated `modules[]`, correct `totalChapters`/`totalLabs`, `contentVersion` + `artifact_sha256` persisted, idempotent skips)
- Content publishing via `scripts/` + CI (`publish-content.yml`): validate → generate manifest/tarball → sync to S3
- Lab lifecycle proxy (start/stop/resume/restart/destroy/exec) with **client-supplied** env config + task validation specs
- **Lab task runner**: `multiple_choice`, `terminal_action`, `port_check`, and `file_check` tasks; answer-based vs state-based validation (exit-code checks preferred); dynamic multiple-choice options resolved in-container
- Success animation + Submit Lab modal (records completion, destroys the container, advances along the linear path)
- WebSocket terminal with tmux persistence, binary resize frames, PTY resize; JWT first-message handshake through the backend proxy
- Session read-through cache keyed by Docker labels (`GET /labs/by_key`) — re-attaches after restarts instead of duplicating containers
- Restart preserves the container (stop + resume) so student changes (e.g. docker group membership) persist
- `validation.execution_user` + `expected_exit_code` added to the lab schema; `execution_user: root` authored for docker lab-1's run-simple-container task

### In Progress
- Content authoring: task definitions for labs 4-10 (both courses) — 16/20 labs are skeleton stubs

### Remaining
- Client plan item 5: **content-integrity sync** (`feat/content-integrity-sync`) — client hash on sync calls + `content_outdated` warning + auto-sync
- Client plan item 6: **NEW content badges** (`feat/new-content-badges`) — diff item IDs on version change, engage-to-dismiss badge expiry
- Backend honoring `validation.execution_user` for validation execs (backend currently hardcodes `user: student` in `_run_orchestrator_exec`) — the docs/bugs.md group-membership false-negative remains open in the backend
- Course immutability enforcement in worker (`structuralHash`)
- Automated test harness (none exists yet; see `docs/TESTING.md` for the manual suite)

## Docs

- [docs/PHASE-0.md](docs/PHASE-0.md) — product problem definition: primary user, proposition, first customer, frozen architecture decisions, kill criteria (**read before any new work**)
- [docs/CLIENT-APP-PLAN.md](docs/CLIENT-APP-PLAN.md) — client-side content delivery implementation plan + branch list
- [docs/CONTENT-PIPELINE.md](docs/CONTENT-PIPELINE.md) — content format, validation, publishing, seeding reference
- [docs/TESTING.md](docs/TESTING.md) — prerequisites, user stories, success criteria, and manual test steps for the fixes so far
- [docs/bugs.md](docs/bugs.md) — known issue: group-membership / transient shell state validation false negatives
- [docs/deferred-improvements.md](docs/deferred-improvements.md) — backlog (Item B, the old backend S3Provider plan, is superseded)
- [postman/README.md](postman/README.md) — Postman end-to-end API suite covering the content-delivery flow
- [MIGRATION.md](MIGRATION.md) — how the canonical format evolved, locked decisions
