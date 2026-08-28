# Backend

FastAPI service for Firebase authentication, the Firestore-backed course
catalog, enrollment/progress tracking, and lab-lifecycle proxying to the
orchestrator. It is a **pure metadata + data-location API**: it reads no course
files and serves none.

## What It Does

| Responsibility | How |
|----------------|-----|
| Verify Firebase tokens | `verify_firebase_token` dependency (Bearer token via Admin SDK) |
| Sync user profiles | `POST /api/v1/users/sync` creates/updates the Firestore user doc |
| Track enrollments | `POST /api/v1/courses/{id}/enroll` creates the enrollment doc |
| Track progress | `PUT /api/v1/courses/{id}/progress` (chapters) + `PUT /api/v1/courses/{id}/labs/{lab_id}/progress` (labs) |
| Serve catalog + TOC | `GET /api/v1/courses`, `GET /api/v1/courses/{id}` — from **Firestore** (seeded by the worker), not from course files |
| Content version handshake | `GET /api/v1/content/version` → `{version, download_url, artifact_sha256, changes}` derived from worker-persisted Firestore fields + `CONTENT_PUBLIC_BASE_URL`; no file I/O |
| Proxy lab lifecycle | `/api/v1/labs/courses/{id}/labs/{labId}/...` — start, stop, resume, destroy, exec, tokens, tasks, validate |
| Validate task answers | `POST .../validate` — executes the client-supplied validation spec in the container, matches server-side |
| Guided in-chapter demos | `/api/v1/demos/...` — provision/exec/reset/destroy a demo container from the chapter content |

## What It Does NOT Do

- Serve course files (chapters, lab YAML, instructions) — content bytes live in
  the S3 bucket and the frontend's local content dir, delivered via the version
  handshake above
- Read `content-v2/` or any mounted course files — there is no `ContentProvider`
  / `FilesystemProvider` anymore
- Manage lab containers or terminal sessions — the orchestrator does that
- Know validation answers — specs flow client → backend → orchestrator; matching
  happens server-side so answers never reach the browser

## Content Version Handshake

The client bootstraps its local content store with one call:

```
GET /api/v1/content/version
```

returns `{version, download_url, artifact_sha256, from_version, changes, updatedAt}`.
`download_url` is `{CONTENT_PUBLIC_BASE_URL}/published/{version}/content.tar.gz`
(the frontend fetches and verifies it against `artifact_sha256`); `changes` is
the worker-computed changelog for the version, so the frontend can badge newly
added/updated chapters and labs. See `next-app/README.md` and
`docs/CONTENT-PIPELINE.md` for the full bootstrap flow.

## Lab Lifecycle Proxy

The backend proxies all lab calls to the orchestrator; the frontend never talks
to the orchestrator directly and its address is never exposed to the browser.
State-changing operations require Firebase auth.

The terminal WebSocket is proxied too (`WS /api/v1/labs/ws/lab`). The browser
sends the JWT as its **first message** (`{"type":"auth","token":...}`) — never
in the URL — and the backend validates it and bridges terminal
input/output/resize frames to the orchestrator's internal `/ws/terminal`.

Sessions use a read-through cache: the orchestrator is the source of truth
(containers carry `com.sgp.*` labels, queryable via `GET /labs/by_key`), so
`start` re-attaches to an existing live container instead of spawning a
duplicate after a restart.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/labs/courses/{id}/labs/{labId}/active` | Yes | Reconnect to existing session (label-based, survives restarts) |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/start` | Yes | Start lab container — body is the **client-supplied** env config `{image, apt_packages, pre_pull, setup}` |
| `GET` | `/api/v1/labs/courses/{id}/labs/{labId}/status/{sid}` | No | Session status |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/stop/{sid}` | No | Stop container |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/resume/{sid}` | No | Resume container |
| `DELETE` | `/api/v1/labs/courses/{id}/labs/{labId}/{sid}` | Yes | Destroy container |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/exec/{sid}` | No | Run command in container |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/tasks` | Yes | Enrich the **client-supplied** task list (dynamic multiple-choice options resolved in-container) |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/validate` | Yes | Validate a task from the **client-supplied** `task_type` + `validation` spec |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/token/{sid}` | Yes | Refresh WebSocket JWT |
| `WS` | `/api/v1/labs/ws/lab` | Handshake | Proxied terminal WebSocket (JWT as first message) |

### Task validation

- **Answer-based** (`multiple_choice`): the choice is compared to
  `validation.expected_answer`, or — for dynamic options — to the output of
  `validation.command`; nothing is executed, so it stays valid regardless of
  later container state.
- **State-based** (`terminal_action`, `port_check`, `file_check`): the backend
  runs `validation.command` in the container (user resolved from
  `validation.execution_user`, `sudo`/`root` → `root`, else `student`) and
  decides from `expected_exit_code` (preferred) or `match_type`
  (contains/exact/regex/line_count).
- `{{session}}` and recorded-key substitutions (`validation.record`) are
  applied to commands before they run.
- Every check is counted once in `enrollments.taskResults` (sticky `passed`,
  `attempts` counter).

## Other Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | No | Status message |
| `GET` | `/health` | No | Health check |
| `GET` | `/auth/me` | Yes | Current user info |

### Users (`/api/v1/users`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sync` | Create/update user profile in Firestore |
| `GET` | `/me` | Get current user profile |
| `PUT` | `/me` | Update display name |
| `GET` | `/me/enrollments` | List enrollments with progress percentage |

### Courses (`/api/v1/courses`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all courses (from Firestore) |
| `GET` | `/{id}` | Get single course (TOC from Firestore) |
| `POST` | `/{id}/enroll` | Enroll in course |
| `PUT` | `/{id}/progress` | Update chapter progress `{moduleId: {chapterId: status}}` |
| `PUT` | `/{id}/labs/{lab_id}/progress` | Mark a lab complete `{moduleId, status}` |
| `GET` | `/{id}/progress` | Get enrollment progress |

### Demos (`/api/v1/demos`)

Provision/exec/reset/destroy a demo container out of the chapter's guided
terminal demo (`:::terminal-demo` in chapter markdown), plus a proxied WS
terminal. See `next-app/lib/demo-directives.ts`.

## Data Models (Firestore Collections)

### `users/{uid}`
```json
{
  "uid": "string",
  "email": "string",
  "displayName": "string",
  "createdAt": "Timestamp",
  "lastLogin": "Timestamp",
  "enrolledCourses": ["course-id"],
  "profileComplete": true
}
```

### `courses/{courseId}`
Written by the worker. `contentVersion` + `artifact_sha256` drive the version
handshake; `modules[].{chapters,labs}` + `totalChapters`/`totalLabs` define
"100% complete".

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "modules": [{ "id": "mod-1", "title": "Module 1", "labs": [...], "chapters": [...] }],
  "totalChapters": 10,
  "totalLabs": 10,
  "level": "beginner",
  "contentHash": "abc123",
  "contentVersion": "d139fdc9a662520e",
  "artifact_sha256": "c64049b9e33c49f3",
  "updatedAt": "Timestamp",
  "createdAt": "Timestamp"
}
```

### `enrollments/{userId}_{courseId}`
```json
{
  "userId": "string",
  "courseId": "string",
  "enrolledAt": "Timestamp",
  "progress": {
    "module-1": { "chapter-1": "completed", "chapter-2": "completed" }
  },
  "labsProgress": {
    "module-1": { "hello-world": "completed" }
  },
  "taskResults": {
    "module-1": { "hello-world": { "run-simple-container": { "attempts": 2, "passed": true, "firstPassedAt": "Timestamp", "lastAttemptAt": "Timestamp" } } }
  },
  "lastAccessed": "Timestamp",
  "status": "in-progress"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `FIREBASE_CREDENTIALS_JSON` | — | Service account JSON string |
| `CONTENT_PUBLIC_BASE_URL` | — | Public S3 base URL used to build `download_url` (e.g. `http://localhost.floci.io:4566/my-content-bucket`) |
| `ORCHESTRATOR_URL` | `http://localhost:8001` | Orchestrator REST base URL (compose sets `http://host.docker.internal:8001`) |
| `WS_ORCHESTRATOR_URL` | `ws://localhost:8001` | Orchestrator WS base URL (server-side only — never sent to the browser) |
| `JWT_SECRET` | `dev-only-change-in-production` | WebSocket JWT signing key |
| `JWT_ALGORITHM` | `HS256` | WebSocket JWT algorithm |
| `JWT_EXPIRY_MINUTES` | `45` | WebSocket token expiry |

## Local Development

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In the compose stack the source is mounted (`./backend:/app`) so Uvicorn
`--reload` applies immediately.

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI entry point
│   ├── config.py               # Env vars: ORCHESTRATOR_URL, CONTENT_PUBLIC_BASE_URL, JWT_*
│   ├── core/
│   │   ├── firebase_config.py  # Admin SDK initialization
│   │   ├── firestore_db.py     # Firestore client
│   │   └── credentials.json    # Service account key (gitignored; worker mounts it too)
│   ├── models/
│   │   └── user.py             # UserProfile / request models
│   ├── routers/
│   │   ├── users.py            # User sync, profile, enrollments
│   │   ├── courses.py          # Catalog/TOC from Firestore, enroll, progress
│   │   ├── content.py          # GET /api/v1/content/version (handshake only)
│   │   ├── labs.py             # Lab lifecycle proxy + task validation
│   │   └── demos.py            # Guided in-chapter demo containers
│   └── utils/
│       └── firebase_util.py    # Token verification dependency
├── Dockerfile
└── requirements.txt
```