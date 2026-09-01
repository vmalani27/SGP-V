# Backend

FastAPI service for Firebase authentication, the Firestore-backed course
catalog, and enrollment/progress tracking. It is a **pure metadata + data-location
API**, fully decoupled from the orchestrator: it reads no course files, serves
none, and never talks to the orchestrator.

## What It Does

| Responsibility | How |
|----------------|-----|
| Verify Firebase tokens | `verify_firebase_token` dependency (Bearer token via Admin SDK) |
| Sync user profiles | `POST /api/v1/users/sync` creates/updates the Firestore user doc |
| Track enrollments | `POST /api/v1/courses/{id}/enroll` creates the enrollment doc |
| Track progress | `PUT /api/v1/courses/{id}/progress` (chapters) + `PUT /api/v1/courses/{id}/labs/{lab_id}/progress` (labs) |
| Serve catalog + TOC | `GET /api/v1/courses`, `GET /api/v1/courses/{id}` — from **Firestore** (seeded by the worker), not from course files |
| Content version handshake | `GET /api/v1/content/version` → `{version, download_url, artifact_sha256, changes}` derived from worker-persisted Firestore fields + `CONTENT_PUBLIC_BASE_URL`; no file I/O |

## What It Does NOT Do

- Serve course files (chapters, lab YAML, instructions) — content bytes live in
  the S3 bucket and the frontend's local content dir, delivered via the version
  handshake above
- Read `content-v2/` or any mounted course files — there is no `ContentProvider`
  / `FilesystemProvider` anymore
- Proxy lab/demo lifecycle, terminal sessions, or validation — the frontend
  calls the orchestrator **directly**; the old `labs.py`/`demos.py` proxy
  routers are removed
- Know validation answers — specs flow client → orchestrator; matching is
  client-side
  happens server-side so answers never reach the browser

## Content Version Handshake

The client bootstraps its local content store with one call:

```
GET /api/v1/content/version
```

returns `{version, download_url, artifact_sha256, from_version, changes, updatedAt}`.
`download_url` is an **S3 presigned URL** for
`published/{version}/content.tar.gz`, signed with the backend's AWS credentials
(`generate_presigned_url`, 1-hour expiry) against the bucket's **regional
endpoint** — not the static `{CONTENT_PUBLIC_BASE_URL}` URL. This lets the S3
bucket stay private. The frontend fetches the presigned URL and verifies it
against `artifact_sha256`; `changes` is the worker-computed changelog for the
version, so the frontend can badge newly added/updated chapters and labs. See
`next-app/README.md` and `docs/CONTENT-PIPELINE.md` for the full bootstrap flow.

## Lab runtime — not proxied

The backend is fully decoupled from the orchestrator. It serves auth, course
catalog/TOC from Firestore, enrollments/progress, and the content-version
handshake only; it never talks to the orchestrator and holds no orchestrator
credentials. Lab lifecycle, validation `exec`, and the terminal are handled by
the frontend talking to the orchestrator **directly**
(`next-app/lib/api.ts` → `orchestratorFetch`; terminal
`ws(s)://<NEXT_PUBLIC_ORCHESTRATOR_URL>/ws/terminal`). The former proxy routers
`app/routers/labs.py` / `app/routers/demos.py` (and `/api/v1/labs/*`,
`/api/v1/demos/*`, `WS /api/v1/labs/ws/lab`) have been **removed** from the
backend.

## Task validation (frontend + orchestrator)

Task validation is **not** a backend concern anymore. The frontend reads the
task spec from its local content, runs `validation.command` via the
orchestrator (`POST /labs/{sessionId}/exec` — user resolved from
`validation.execution_user`, `sudo`/`root` → `root`, else `student`), and
decides client-side from `expected_exit_code` (preferred) or `match_type`
(contains/exact/regex/line_count). `{{session_id}}` and recorded-key
substitutions (`validation.record`) are applied before the command runs. The
backend only persists lab progress (`labsProgress`) when the lab is submitted —
per-task `taskResults` are not written by the current flow.

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

**Removed.** The backend no longer proxies demo containers. Guided
`:::terminal-demo` directives are served by orchestrator `/demos/*` endpoints
called directly from the frontend (`next-app/lib/demo-directives.ts` +
`api.demos.*`).

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

> Per-task `taskResults` are **no longer written** by the backend — the code
> path that recorded them was removed along with the lab proxy routers. Today
> the backend only writes `progress` (chapters) and `labsProgress` (labs);
> `taskResults` may still exist in Firestore from older runs.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `FIREBASE_CREDENTIALS_JSON` | — | Service account JSON string |
| `CONTENT_PUBLIC_BASE_URL` | — | Public/virtual-hosted S3 base URL parsed for the bucket name + region (e.g. `https://content-dev-...-ap-south-1-an.s3.ap-south-1.amazonaws.com`) |
| `AWS_ACCESS_KEY_ID` | — | IAM access key used to sign presigned S3 download URLs |
| `AWS_SECRET_ACCESS_KEY` | — | IAM secret key used to sign presigned S3 download URLs |
| `AWS_DEFAULT_REGION` | `ap-south-1` | Region fallback for signing (region is also parsed from `CONTENT_PUBLIC_BASE_URL`) |

> The backend signs presigned S3 URLs on `/api/v1/content/version` using the
> `AWS_*` credentials and `CONTENT_PUBLIC_BASE_URL`. If creds are missing it
> falls back to the static public URL (which yields `403` on a private bucket);
> the IAM principal needs `s3:GetObject` on `published/*`.

Legacy vars the compose files still inject (`ORCHESTRATOR_URL`,
`WS_ORCHESTRATOR_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRY_MINUTES`) are
**ignored** by the backend — it never talks to the orchestrator, and there is no
WebSocket JWT flow on this service anymore.

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
│   ├── config.py               # Env vars: CONTENT_PUBLIC_BASE_URL
│   ├── core/
│   │   ├── firebase_config.py  # Admin SDK initialization
│   │   ├── firestore_db.py     # Firestore client
│   │   └── credentials.json    # Service account key (gitignored; worker mounts it too)
│   ├── models/
│   │   └── user.py             # UserProfile / request models
│   ├── routers/
│   │   ├── users.py            # User sync, profile, enrollments
│   │   ├── courses.py          # Catalog/TOC from Firestore, enroll, progress
│   │   └── content.py          # GET /api/v1/content/version (handshake only)
│   └── utils/
│       └── firebase_util.py    # Token verification dependency
├── Dockerfile
└── requirements.txt
```