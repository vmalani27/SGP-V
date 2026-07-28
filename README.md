# LabOps — DevOps Learning Platform

A KodeKloud-style platform for learning Git and Docker through hands-on interactive labs with real terminal environments.

## Architecture

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Frontend   │────────→│   Backend    │────────→│   Firebase   │
│  Next.js     │         │  FastAPI     │         │  Auth + DB   │
│  port 3000   │         │  port 8000   │         │              │
└──────────────┘         └──────┬───────┘         └──────────────┘
                                │
                                │ REST + WebSocket
                                ▼
                         ┌──────────────┐         ┌──────────────┐
                         │ Orchestrator │────────→│   Docker     │
                         │  FastAPI     │         │  + Sysbox    │
                         │  port 8001   │         │              │
                         └──────────────┘         └──────────────┘

                         ┌──────────────┐         ┌──────────────┐
                         │   Worker     │────────→│   Firebase   │
                         │  FastAPI     │         │  Firestore   │
                         │  port 8002   │         │  (courses)   │
                         └──────────────┘         └──────────────┘
```

| Service | Port | Responsibility |
|---------|------|----------------|
| **Frontend** | 3000 | UI, auth flow, learning wizard, xterm.js terminal |
| **Backend** | 8000 | API gateway, Firebase auth, content serving, enrollment/progress |
| **Orchestrator** | 8001 | Docker container lifecycle, command execution, WebSocket terminal |
| **Worker** | 8002 | Content validation, Firestore metadata sync |

## What Each Component Does

### Frontend (`next-app/`)
- Login/register with Firebase Authentication
- Course catalog and enrollment
- Chapter viewer with theory + quizzes
- Lab viewer with resizable instructions + terminal panels
- Gets all content from backend API (never talks to orchestrator directly)
- Drives the learning flow (modules → chapters → labs)

### Backend (`backend/`)
- Verifies Firebase ID tokens (Bearer auth)
- Syncs user profiles to Firestore (`users` collection)
- Tracks enrollment and progress in Firestore (`enrollments` collection)
- Serves all course content via `ContentProvider` abstraction (filesystem now, S3 later)
- Computes enrollment percentage from `totalChapters` in Firestore courses

### Orchestrator (`orchestrator/`)
- Creates Sysbox Docker containers for lab environments
- Runs arbitrary commands inside containers (`POST /labs/{id}/exec`)
- Provides WebSocket terminal (xterm.js ↔ container bash)
- Auto-destroys labs after timeout
- Zero content knowledge — reads no course files

### Worker (`worker/`)
- Validates `content-v2/` schema (index.json, course.json TOC, markdown existence, lab YAML structure)
- Syncs course metadata to Firestore `courses` collection
- Idempotent: uses `contentHash` to skip unchanged courses
- Removes orphaned courses from Firestore
- Runs on a polling loop (300s interval)

### Content (`content-v2/`)
Single source of truth for all course data. Mounted read-only into all services.

```
content-v2/
  index.json                              # course catalog
  courses/{id}/
    course.json                           # TOC only — modules, chapters, labs
    modules/{module-id}/
      chapters/{chapter-id}.md            # theory content (markdown)
      labs/
        lab-{n}.md                        # lab instructions (markdown)
        lab-{n}.yaml                      # environment + validation tasks
```

- **No quiz data in course.json.** No correct answers anywhere in the content.
- **No static quizzes.** All validation runs server-side in lab containers.
- **Folder structure mirrors module hierarchy.** Flat directories are gone.

## Firestore Collections

| Collection | Written by | Document ID | Shape |
|------------|-----------|-------------|-------|
| `courses` | Worker | Course ID (e.g. `git-fundamentals`) | Full module/chapter/lab TOC + `contentHash` + `totalChapters` |
| `users` | Backend (on login) | Firebase Auth UID | `enrolledCourses: [courseId, ...]` |
| `enrollments` | Backend (on enroll/progress) | `{uid}_{courseId}` | `progress: {moduleId: {chapterId: "completed"}}` |

## Content API (Backend)

Backend is the sole proxy for all content. Content is served via `ContentProvider` abstraction — swap `FilesystemProvider` for `S3Provider` when S3 is ready.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/content/courses` | No | Course catalog |
| `GET /api/v1/content/courses/{id}` | No | Course TOC (modules, chapters, labs) |
| `GET /api/v1/content/courses/{id}/chapters/{chapterId}` | No | Chapter markdown + metadata |
| `GET /api/v1/content/courses/{id}/labs` | No | Lab list for a course |
| `GET /api/v1/content/courses/{id}/labs/{labId}/instructions` | No | Lab instructions markdown |
| `GET /api/v1/content/courses/{id}/labs/{labId}/config` | No | Lab YAML config (env + validation) |

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
│   └── courses/
│       ├── git-fundamentals/
│       │   ├── course.json            # TOC only (no quiz data, no answers)
│       │   └── modules/
│       │       ├── git-basics/
│       │       │   ├── chapters/      # chapter-1.md, chapter-2.md, chapter-3.md
│       │       │   └── labs/          # lab-1.md, lab-1.yaml, ...
│       │       ├── branching-history/
│       │       ├── remote-collaboration/
│       │       └── complete-workflow/
│       └── docker-mastery/
│           └── ...                    # Same structure
├── orchestrator/                      # Docker lab executor (FastAPI)
│   ├── lab-images/                    # Base image Dockerfiles
│   │   ├── Dockerfile.ubuntu          # sgp-lab-ubuntu: systemd + student user
│   │   ├── Dockerfile.docker          # sgp-lab-docker: + Docker daemon (DinD)
│   │   └── Dockerfile.git             # sgp-lab-git: + git pre-installed
│   ├── app/
│   │   ├── main.py                    # Entry point, lifespan, CORS
│   │   ├── config.py                  # DOCKER_HOST, LAB_PREFIX
│   │   ├── api/
│   │   │   ├── labs.py                # POST /labs, exec, validate, inspect
│   │   │   ├── health.py              # GET /health
│   │   │   └── schemas.py             # GET /schemas/yaml, /schemas/sample
│   │   ├── services/
│   │   │   └── docker_service.py      # Docker SDK wrapper
│   │   ├── models/
│   │   │   └── session.py             # LabSession, LabStatus
│   │   └── websocket/
│   │       └── terminal.py            # WS /ws/{id}/terminal
│   ├── schemas/                       # Lab YAML reference (sample + JSON schema)
│   ├── Dockerfile
│   └── requirements.txt
├── backend/                           # API gateway + auth + content (FastAPI)
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
│   │   │   └── content.py             # Content API (serves via ContentProvider)
│   │   ├── services/
│   │   │   └── content_provider.py    # ContentProvider ABC + FilesystemProvider (S3-ready)
│   │   └── utils/
│   │       └── firebase_util.py       # Token verification
│   ├── Dockerfile
│   └── requirements.txt
├── worker/                            # Content sync to Firestore (FastAPI)
│   ├── app/
│   │   ├── main.py                    # Background sync loop + /health, /status, /sync
│   │   ├── config.py                  # CONTENT_DIR, Firebase init, get_firestore()
│   │   ├── validator.py               # v2 schema: index, TOC, markdown, lab YAML
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
    │           ├── CourseProgressHeader.tsx  # Progress bar (reads enrollment)
    │           ├── chapters/[chapterId]/page.tsx  # Theory + quiz
    │           └── labs/[labId]/page.tsx           # Lab viewer + terminal
    ├── components/
    │   ├── Navbar.tsx
    │   ├── LabTerminal.tsx            # Terminal + controls
    │   ├── TerminalPane.tsx           # xterm.js integration
    │   ├── ChapterClient.tsx          # Theory + quiz flow (accepts moduleId)
    │   ├── LearningPlayer.tsx         # Sidebar with progress
    │   └── ...
    ├── lib/
    │   ├── firebase.ts                # Client SDK init
    │   ├── auth-context.tsx           # Auth provider
    │   ├── api.ts                     # Backend API client
    │   ├── content-server.ts          # Content fetch from backend
    │   └── content-types.ts           # TypeScript interfaces
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
| `ORCHESTRATOR_URL` | `http://orchestrator:8000` | Orchestrator base URL (Phase 3 — lab validation) |

### Orchestrator

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket path |
| `LAB_PREFIX` | `sgp-lab` | Container name prefix |

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
- Chapter quiz flow (client-side grading, progress persisted to Firestore)
- Content-v2 as source of truth with worker sync
- Worker validates v2 schema and syncs metadata to Firestore
- Backend content serving via ContentProvider abstraction (filesystem reads, S3-ready)
- Orchestrator labs-only mode — zero content knowledge

### In Progress
- Frontend lab task runner (replace static quizzes with dynamic YAML-driven tasks)

### Remaining
- All 18 remaining lab YAML files
- S3 deployment architecture (swap `FilesystemProvider` for `S3Provider`)
- Course immutability enforcement in worker
