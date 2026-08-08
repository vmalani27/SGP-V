# LabOps — DevOps Learning Platform

A KodeKloud-style platform for learning Git and Docker through hands-on interactive labs with real terminal environments.

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  sgp-frontend    │────────→│  sgp-backend     │────────→│  Firebase    │
│  Next.js 3000    │         │  FastAPI 8000    │         │  Auth + DB   │
└──────────────────┘         └───────┬──────────┘         └──────────────┘
                                     │
                                     │ REST + WebSocket
                                     ▼
                              ┌──────────────────┐         ┌──────────────┐
                              │  sgp-orchestrator│────────→│  Docker      │
                              │  FastAPI 8001    │         │  + Sysbox    │
                              └──────────────────┘         └──────────────┘

                              ┌──────────────────┐         ┌──────────────┐
                              │  sgp-worker      │────────→│  Firebase    │
                              │  FastAPI 8002    │         │  Firestore   │
                              └──────────────────┘         └──────────────┘
```

| Service | Port | Responsibility |
|---------|------|----------------|
| **sgp-frontend** | 3000 | UI, auth flow, learning wizard, xterm.js terminal |
| **sgp-backend** | 8000 | API gateway, Firebase auth, content serving, enrollment/progress |
| **sgp-orchestrator** | 8001 | Docker container lifecycle, command execution, WebSocket terminal |
| **sgp-worker** | 8002 | Content validation, Firestore metadata sync |

## What Each Component Does

### Frontend (`next-app/`)
- Login/register with Firebase Authentication
- Course catalog and enrollment
- Chapter viewer with theory + quizzes
- Lab viewer with tasks runner, WebSocket terminal, and submit flow
- Runs YAML-driven lab tasks: multiple choice, terminal commands, port checks
- Success animation + Submit Lab modal (records completion, destroys container)
- Gets all content from backend API (never talks to orchestrator directly)
- Drives the learning flow (modules → chapters → labs)

### Backend (`backend/`)
- Verifies Firebase ID tokens (Bearer auth)
- Syncs user profiles to Firestore (`users` collection)
- Tracks enrollment and progress in Firestore (`enrollments` collection)
- Serves all course content via `ContentProvider` abstraction (filesystem now, S3 later)
- Proxies lab lifecycle to orchestrator (start, stop, resume, restart, destroy, exec)
- Proxies the terminal WebSocket: browser connects to the backend (`/api/v1/labs/ws/lab`), the backend bridges frames to the orchestrator's internal `/ws/terminal` — the orchestrator address is never exposed to the browser and the JWT is sent as a first-message handshake, not in the URL
- Validates lab task answers server-side (exec in container — answers never leave the container)
- Tracks chapter and lab completion in Firestore (`progress` + `labsProgress`)
- Computes enrollment percentage from `totalChapters` in Firestore courses

### Orchestrator (`orchestrator/`)
- Creates Sysbox Docker containers for lab environments (labelled `com.sgp.user_id` / `course_id` / `lab_id`)
- Runs arbitrary commands inside containers (`POST /labs/{id}/exec`)
- Provides WebSocket terminal (`/ws/terminal`, JWT first-message handshake) with tmux persistence — the browser connects via the backend proxy
- Source of truth for sessions: `GET /labs/by_key` recovers a live container from its labels after a restart
- Resizes the remote PTY to match the client (`resize` frames), so terminals stay in sync
- Auto-destroys labs after timeout
- Zero content knowledge — reads no course files

### Worker (`worker/`)
- Validates `content-v2/` schema (index.json, course.yaml + module.yaml TOC, markdown existence, lab YAML structure)
- Syncs course metadata to Firestore `courses` collection
- Idempotent: uses `contentHash` to skip unchanged courses
- Removes orphaned courses from Firestore
- Runs on a polling loop (300s interval)
- **Does NOT do anything at lab runtime** — no Docker socket, no container/image management. Base lab images
  (`sgp-lab-ubuntu/docker/git`) are built from `orchestrator/lab-images/` and ensured (pull/build) by the
  orchestrator at start; the worker only reads content and writes course metadata to Firestore.

### Content (`content-v2/`)
Single source of truth for all course data. Mounted read-only into all services.

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
      command: "docker images -q | wc -l"
      match_type: exact
```
Lab config lives at `labs/{lab-id}/lab.yaml`, instructions at `labs/{lab-id}/instructions.md`.
The environment is always a string reference to a shared `environments/{name}.yaml`.

> End-to-end reference (file templates, validation, Firestore seeding, serving,
> frontend rendering, authoring workflow): see [docs/CONTENT-PIPELINE.md](docs/CONTENT-PIPELINE.md).

### Validation model
- All validation is exec-based and server-side. The frontend calls `POST /api/v1/labs/courses/{id}/labs/{labId}/validate` with the task id (and selected option for multiple-choice tasks).
- The backend runs the validation command in the lab container via the orchestrator and matches the output against `expected_output` using the `match_type` (contains/exact/regex/port).
- Task types: `multiple_choice`, `terminal_action`, `port_check`. Multiple-choice options are resolved server-side (dynamic options supported), so answers never ship to the client.
- **No static answers in content files.** Correct answers never leave the container.

## Firestore Collections

| Collection | Written by | Document ID | Shape |
|------------|-----------|-------------|-------|
| `courses` | Worker | Course ID (e.g. `git-fundamentals`) | Full module/chapter/lab TOC + `contentHash` + `totalChapters` |
| `users` | Backend (on login) | Firebase Auth UID | `enrolledCourses: [courseId, ...]` |
| `enrollments` | Backend (on enroll/progress) | `{uid}_{courseId}` | `progress: {moduleId: {chapterId: "completed"}}` + `labsProgress: {moduleId: {labId: "completed"}}` |

## Content API (Backend)

Backend is the sole proxy for all content. Content is served via `ContentProvider` abstraction — swap `FilesystemProvider` for `S3Provider` when S3 is ready.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/content/courses` | No | Course catalog |
| `GET /api/v1/content/courses/{id}` | No | Course TOC (modules, chapters, labs with titles) |
| `GET /api/v1/content/courses/{id}/chapters/{chapterId}` | No | Chapter markdown + metadata |
| `GET /api/v1/content/courses/{id}/labs` | No | Lab list for a course |
| `GET /api/v1/content/courses/{id}/labs/{labId}/instructions` | No | Lab instructions markdown |
| `GET /api/v1/content/courses/{id}/labs/{labId}/config` | No | Lab YAML config (environment resolved + tasks) |
| `GET /api/v1/content/courses/{id}/labs/{labId}/tasks` | No | Lab tasks (extracted from config, flat format) |

## Lab Lifecycle API (Backend Proxy)

All lab lifecycle calls are proxied through the backend. The frontend never talks to the orchestrator directly.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET  /api/v1/labs/courses/{id}/labs/{labId}/active` | Yes | Reconnect to existing session |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/start` | Yes | Start lab container |
| `GET  /api/v1/labs/courses/{id}/labs/{labId}/status/{sid}` | No | Session status |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/stop/{sid}` | No | Stop container |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/resume/{sid}` | No | Resume container |
| `DELETE /api/v1/labs/courses/{id}/labs/{labId}/{sid}` | Yes | Destroy container |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/exec/{sid}` | No | Run command in container |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/validate` | Yes | Validate a task answer (exec in container) |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/token/{sid}` | Yes | Refresh WebSocket token |

## Quick Start

### Prerequisites
- Docker Engine with Sysbox runtime (`sysbox-runc`)
- Docker Compose v2
- A Firebase project (Auth + Firestore enabled)

### 1. Configure environment

Create `.env` in the project root:
```env
# Firebase (required)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}
```

The frontend environment variables are set in `docker-compose.yml`:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 2. Start all services

```bash
docker compose up
```

### 3. Seed course data

The worker automatically validates and syncs `content-v2/` to Firestore on startup (and every 300s). Check the worker logs:

```bash
docker compose logs -f worker
```

### 4. Build lab images (for orchestrator)

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
- **Orchestrator**: Uvicorn `--reload` (watches `.py` files)
- **Worker**: Uvicorn `--reload` (watches `.py` files)

### Volume mounts

| Mount | Container | Purpose |
|-------|-----------|---------|
| `./content-v2:/app/content:ro` | Backend, Worker | Read-only course content |
| `./next-app:/app` | Frontend | Source code hot reload |
| `./backend:/app` | Backend | Source code hot reload |
| `./orchestrator:/app` | Orchestrator | Source code hot reload |
| `./worker:/app` | Worker | Source code hot reload |
| `/var/run/docker.sock` | Orchestrator | Docker daemon access for lab containers |

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

# Stop all services
docker compose down

# Stop and remove volumes (fresh start)
docker compose down -v

# Rebuild a single service
docker compose up --build backend
```

## Project Structure

```
SGP_V/
├── docker-compose.yml                 # 4 services: frontend, backend, orchestrator, worker
├── content-v2/                        # Source of truth for all course data
│   ├── index.json                     # Course catalog (v2)
│   ├── environments/                  # Shared environment definitions
│   │   └── docker-basic.yaml          # base_image, pre_pull for DinD labs
│   └── courses/
│       ├── git-fundamentals/
│       │   ├── course.yaml            # TOC — module refs (canonical YAML)
│       │   └── modules/
│       │       ├── git-basics/
│       │       │   ├── module.yaml    # ordered items (chapters + labs)
│       │       │   ├── chapters/      # chapter-1.md, chapter-2.md, chapter-3.md
│       │       │   └── labs/          # lab-N/lab.yaml + lab-N/instructions.md
│       │       ├── branching-history/
│       │       ├── remote-collaboration/
│       │       └── complete-workflow/
│       └── docker-mastery/
│           ├── course.yaml            # TOC — module refs
│           └── modules/
│               ├── docker-fundamentals/
│               │   ├── module.yaml    # ordered items (chapters + labs)
│               │   ├── chapters/      # chapter-1.md, chapter-2.md, chapter-3.md
│               │   └── labs/          # lab-N/lab.yaml + lab-N/instructions.md
│               ├── building-images/ ...
│               ├── container-networking/ ...
│               └── persistent-storage/ ...
├── orchestrator/                      # Docker lab executor (FastAPI)
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
│   │   │   └── docker_service.py      # Docker SDK wrapper
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
├── backend/                           # API gateway + auth + content + lab proxy (FastAPI)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py                  # ORCHESTRATOR_URL, CONTENT_DIR, CONTENT_SOURCE
│   │   ├── core/
│   │   │   ├── firebase_config.py     # Admin SDK init
│   │   │   └── firestore_db.py        # Firestore client
│   │   ├── models/
│   │   │   └── user.py
│   │   ├── routers/
│   │   │   ├── users.py               # User sync, profile, enrollments (% calc)
│   │   │   ├── courses.py             # CRUD, enroll, progress (PUT /progress)
│   │   │   ├── content.py             # Content API (TOC, chapters, labs, tasks)
│   │   │   └── labs.py                # Lab lifecycle proxy → orchestrator
│   │   ├── services/
│   │   │   └── content_provider.py    # ContentProvider ABC + FilesystemProvider
│   │   └── utils/
│   │       └── firebase_util.py       # Token verification
│   ├── Dockerfile
│   └── requirements.txt
├── worker/                            # Content sync to Firestore (FastAPI)
│   ├── app/
│   │   ├── main.py                    # Background sync loop + /health, /status, /sync
│   │   ├── config.py                  # CONTENT_DIR, Firebase init, get_firestore()
│   │   ├── validator.py               # v2 schema: index, TOC, lab YAML (both formats)
│   │   └── seeder.py                  # Firestore upsert with contentHash, orphan cleanup
│   ├── Dockerfile
│   └── requirements.txt
└── next-app/                          # Frontend (Next.js)
    ├── app/
    │   ├── page.tsx                   # Landing page
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   ├── dashboard/page.tsx
    │   └── courses/
    │       └── [courseId]/
    │           ├── page.tsx           # Course detail
    │           ├── CourseProgressHeader.tsx
    │           ├── chapters/[chapterId]/page.tsx
    │           └── labs/[labId]/page.tsx
    ├── components/
    │   ├── Navbar.tsx
    │   ├── LabTerminal.tsx               # xterm.js terminal (WebSocket + resize)
    │   ├── LabTaskRenderer.tsx           # steps through lab tasks
    │   ├── MultipleChoiceTask.tsx        # server-validated options
    │   ├── TerminalActionTask.tsx        # run-command tasks
    │   ├── PortCheckTask.tsx             # port/path check tasks
    │   ├── TaskProgress.tsx              # n/total indicator
    │   ├── CelebrationOverlay.tsx        # correct-answer animation
    │   ├── SubmitLabModal.tsx            # submit flow (record + destroy)
    │   ├── ChapterClient.tsx
    │   ├── LearningPlayer.tsx
    │   └── ...
    ├── lib/
    │   ├── firebase.ts
    │   ├── auth-context.tsx
    │   ├── api.ts
    │   ├── task-types.ts
    │   ├── content-server.ts
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
| `CONTENT_DIR` | `/app/content` | Path to content-v2 mount |
| `CONTENT_SOURCE` | `filesystem` | Content provider backend (`filesystem` or `s3` in future) |
| `ORCHESTRATOR_URL` | `http://orchestrator:8000` | Orchestrator REST base URL (internal) |
| `WS_ORCHESTRATOR_URL` | `ws://localhost:8001` | Orchestrator WS base URL (internal, server-side only — never sent to the browser) |

### Orchestrator

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket path |
| `LAB_PREFIX` | `sgp-lab` | Container name prefix |
| `LAB_TIMEOUT_MINUTES` | `40` | Auto-destroy timeout |

### Worker

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTENT_DIR` | `/app/content` | Path to content-v2 mount |
| `FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `FIREBASE_CREDENTIALS_JSON` | — | Service account JSON |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/app/credentials.json` | Fallback credential path |
| `SYNC_INTERVAL_SECONDS` | `300` | Polling interval for content sync |

### Frontend

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend URL (default: `http://localhost:8000`) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client config |

## Deployment Architecture (target)

Current state: all services run locally with `content-v2/` mounted as a Docker volume. Worker polls the filesystem.

Target: S3-backed content with event-driven sync.

```
┌─────────────┐     S3 event      ┌─────────────┐
│  S3 Bucket  │──────────────────→│   Worker     │
│ (content-v2)│   (PUT/DELETE)    │ (Lambda)     │
└──────┬──────┘                   └──────┬──────┘
       │                                  │
       │  GET (presigned URL)            │  sync metadata
       │                                  ▼
       │                          ┌──────────────┐
       │                          │   Firestore   │
       │                          └──────────────┘
       ▼
┌─────────────┐
│   Backend    │  reads from S3
│  (FastAPI)   │
└─────────────┘
```

- **Content authoring**: push to S3, no rebuild needed
- **Worker**: Lambda triggered by S3 events, validates + syncs to Firestore instantly
- **Backend**: reads content from S3 (presigned URLs or CloudFront)
- **Course immutability**: once a course has enrolled users, structural changes are append-only. See `MIGRATION.md` for full rules.

## Current Status

### Working
- Firebase login/register + user sync
- Course catalog from Firestore
- Enrollment and progress tracking with percentage calculation
- Chapter theory viewer + quiz flow (client-side grading, progress persisted to Firestore)
- Content-v2 as source of truth with worker sync
- Worker validates both YAML and JSON course formats, syncs metadata to Firestore
- Worker reads `course.yaml` (primary) with `course.json` fallback
- Backend content serving via ContentProvider abstraction (filesystem reads, S3-ready)
- Orchestrator labs-only mode — zero content knowledge
- Lab lifecycle proxy: start, stop, resume, restart, destroy, exec through backend
- **Lab task runner**: `multiple_choice`, `terminal_action`, and `port_check` tasks, validated server-side (answers never leave the container)
- Success animation + Submit Lab modal on completion (records lab completion to Firestore, destroys the container, returns to course)
- WebSocket terminal with tmux persistence, binary resize frames, and PTY resize so the remote size matches the local terminal
- Restart preserves the container (stop + resume) so student changes (e.g. docker group membership) persist
- Lab completion shown in the course curriculum TOC (`labsProgress`)
- Tasks endpoint: extracts tasks from the canonical per-lab YAML format
- Shared environment definitions (`environments/docker-basic.yaml`, `environments/linux-basic.yaml`)
- Canonical course format: `course.yaml` → `module.yaml` (`items`) → `labs/{id}/lab.yaml` + `instructions.md`, shared env refs. No course.json, monolithic phases, or flat lab YAML remain
- All 10 Docker Mastery labs are discoverable through course TOC (lab-1..3 have authored tasks, the rest are skeleton stubs)
- Worker validates cleanly with warnings (skeleton labs) and seeds accurate Firestore docs (real `order`, `description`, `chapterId`, resolved titles); graceful `validation_failed` state without blocking the cycle

### In Progress
- Content authoring: task definitions for labs 4-10 (both courses)

### Remaining
- S3 deployment architecture (swap `FilesystemProvider` for `S3Provider`) — see `docs/deferred-improvements.md`
- Course immutability enforcement in worker (`structuralHash`)
