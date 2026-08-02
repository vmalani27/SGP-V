# Backend

FastAPI service for Firebase authentication, content serving, lab lifecycle proxying, and Firestore progress tracking.

## What It Does

| Responsibility | How |
|----------------|-----|
| Verify Firebase tokens | `verify_firebase_token` dependency extracts Bearer token, verifies with Admin SDK |
| Sync user profiles | `POST /api/v1/users/sync` creates/updates user doc in Firestore |
| Track enrollments | `POST /api/v1/courses/{id}/enroll` creates enrollment doc |
| Track progress | `PUT /api/v1/courses/{id}/progress` (chapters) + `PUT /api/v1/courses/{id}/labs/{lab_id}/progress` (labs) |
| Serve course content | `GET /api/v1/content/...` — TOC, chapters, lab instructions, lab YAML config, tasks |
| Proxy lab lifecycle | `/api/v1/labs/courses/{id}/labs/{labId}/...` — start, stop, resume, destroy, exec |
| Validate task answers | `POST /api/v1/labs/courses/{id}/labs/{labId}/validate` — exec in container, server-side match |

## What It Does NOT Do

- Manage lab containers — the orchestrator does that
- Handle terminal sessions — the orchestrator does that
- Read lab.yaml for validation — the backend runs the validation command; answers are matched server-side and never exposed to the client

## Content Serving

The backend serves all course content through a `ContentProvider` abstraction:

```
ContentProvider (ABC)
  ├── FilesystemProvider   ← active (reads content-v2/ from mounted volume)
  └── S3Provider           ← future (CONTENT_SOURCE=s3)
```

The provider reads `course.yaml` (primary) with `course.json` fallback, resolves `module.yaml` references, and extracts lab YAML from either flat per-lab directories or old monolithic files. Environment references (string values in `environment` field) are resolved to shared files in `environments/`.

### Content API Endpoints

All content endpoints are unauthenticated (served publicly).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/content/courses` | Course catalog (from index.json) |
| `GET` | `/api/v1/content/courses/{id}` | Course TOC (resolved modules, chapters, labs with titles) |
| `GET` | `/api/v1/content/courses/{id}/chapters/{chapterId}` | Chapter markdown + metadata |
| `GET` | `/api/v1/content/courses/{id}/labs` | Lab list for a course |
| `GET` | `/api/v1/content/courses/{id}/labs/{labId}/instructions` | Lab instructions markdown |
| `GET` | `/api/v1/content/courses/{id}/labs/{labId}/config` | Lab YAML config (environment resolved, full content) |
| `GET` | `/api/v1/content/courses/{id}/labs/{labId}/tasks` | Extracted tasks (flat list, from either format) |

## Lab Lifecycle Proxy

The backend proxies all lab lifecycle calls to the orchestrator. The frontend never talks to the orchestrator directly. These endpoints require Firebase auth (Bearer token) for state-changing operations.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/labs/courses/{id}/labs/{labId}/active` | Yes | Reconnect to existing session |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/start` | Yes | Start lab container (reads lab YAML, forwards env config) |
| `GET` | `/api/v1/labs/courses/{id}/labs/{labId}/status/{sid}` | No | Session status |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/stop/{sid}` | No | Stop container |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/resume/{sid}` | No | Resume container |
| `DELETE` | `/api/v1/labs/courses/{id}/labs/{labId}/{sid}` | Yes | Destroy container |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/exec/{sid}` | No | Run command in container |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/validate` | Yes | Validate a task answer (runs the validation command in the container, matches server-side) |
| `POST` | `/api/v1/labs/courses/{id}/labs/{labId}/token/{sid}` | Yes | Refresh WebSocket JWT token |

## Other API Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | No | Status message |
| `GET` | `/health` | No | Health check |
| `GET` | `/auth/me` | Yes | Current user info |

### Users (`/api/v1/users`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/users/sync` | Create/update user profile in Firestore |
| `GET` | `/api/v1/users/me` | Get current user profile |
| `PUT` | `/api/v1/users/me` | Update display name |
| `GET` | `/api/v1/users/me/enrollments` | List enrollments with progress percentage |

### Courses (`/api/v1/courses`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/courses` | List all courses (from Firestore) |
| `GET` | `/api/v1/courses/{id}` | Get single course |
| `POST` | `/api/v1/courses/{id}/enroll` | Enroll in course |
| `PUT` | `/api/v1/courses/{id}/progress` | Update chapter progress `{moduleId: {chapterId: status}}` |
| `PUT` | `/api/v1/courses/{id}/labs/{lab_id}/progress` | Mark a lab complete `{moduleId, status}` |
| `GET` | `/api/v1/courses/{id}/progress` | Get enrollment progress |

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
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "modules": [{ "id": "mod-1", "title": "Module 1", "labs": [...], "chapters": [...] }],
  "totalChapters": 10,
  "level": "beginner",
  "contentHash": "abc123",
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
  "lastAccessed": "Timestamp",
  "status": "in-progress"
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | — | Firebase project ID |
| `FIREBASE_CREDENTIALS_JSON` | No* | — | Service account JSON string |
| `FIREBASE_CREDENTIALS_PATH` | No* | — | Path to service account file |
| `GOOGLE_APPLICATION_CREDENTIALS` | No* | — | Standard Google auth variable |
| `CONTENT_DIR` | No | `/app/content` | Path to content-v2 mount |
| `CONTENT_SOURCE` | No | `filesystem` | Content provider backend |
| `ORCHESTRATOR_URL` | No | `http://orchestrator:8000` | Orchestrator base URL |
| `JWT_SECRET` | No | `dev-secret` | WebSocket JWT signing key |
| `JWT_ALGORITHM` | No | `HS256` | JWT algorithm |
| `JWT_EXPIRY_MINUTES` | No | `60` | WebSocket token expiry |

\*Firebase credentials: tries `FIREBASE_CREDENTIALS_JSON` → `FIREBASE_CREDENTIALS_PATH` → `GOOGLE_APPLICATION_CREDENTIALS` → Application Default

## Local Development

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI entry point
│   ├── config.py               # Env vars: CONTENT_DIR, ORCHESTRATOR_URL, JWT_SECRET
│   ├── core/
│   │   ├── firebase_config.py  # Admin SDK initialization
│   │   ├── firestore_db.py     # Firestore client
│   │   └── credentials.json    # Service account key (gitignored)
│   ├── models/
│   │   └── user.py             # UserProfile
│   ├── routers/
│   │   ├── users.py            # User sync, profile, enrollments
│   │   ├── courses.py          # Enrollment, progress
│   │   ├── content.py          # Content API (TOC, chapters, labs, tasks)
│   │   └── labs.py             # Lab lifecycle proxy + task validation
│   ├── services/
│   │   └── content_provider.py # FilesystemProvider (reads YAML + JSON, resolves env refs)
│   └── utils/
│       └── firebase_util.py    # Token verification dependency
├── Dockerfile
└── requirements.txt
```
