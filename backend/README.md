# Backend

FastAPI service for Firebase authentication and Firestore progress tracking.

## What It Does

| Responsibility | How |
|----------------|-----|
| Verify Firebase tokens | `verify_firebase_token` dependency extracts Bearer token, verifies with Admin SDK |
| Sync user profiles | `POST /api/v1/users/sync` creates/updates user doc in Firestore |
| Track enrollments | `POST /api/v1/courses/{id}/enroll` creates enrollment doc |
| Track progress | `POST /api/v1/courses/{id}/labs/{lab_id}/complete` updates progress map |
| Seed course data | `python -m app.scripts.seed_courses` reads content files, upserts to Firestore |

## What It Does NOT Do

- Serve course content — the orchestrator does that
- Manage lab containers — the orchestrator does that
- Handle terminal sessions — the orchestrator does that
- Run validation commands — the orchestrator does that

## Current State

The backend currently reads `course.json` from the shared `content/` directory to:
- Compute lab counts for progress percentages
- Find which module a lab belongs to (for progress tracking)

**Target:** Remove these file reads and get the data from the orchestrator's content API instead.

## API Endpoints

Base URL: `http://localhost:8000`

All endpoints require `Authorization: Bearer <firebase_id_token>` unless noted.

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
| `GET` | `/api/v1/users/me/enrollments` | List enrollments with progress |

### Courses (`/api/v1/courses`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/courses` | List all courses (from Firestore) |
| `GET` | `/api/v1/courses/{id}` | Get single course |
| `POST` | `/api/v1/courses/{id}/enroll` | Enroll in course |
| `POST` | `/api/v1/courses/{id}/labs/{lab_id}/complete` | Mark lab done, update progress |
| `GET` | `/api/v1/courses/{id}/progress` | Get enrollment progress |

### Labs (`/api/v1/labs`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/labs/start` | Start lab session (creates Firestore doc) |
| `GET` | `/api/v1/labs/session/{id}` | Get session status |
| `POST` | `/api/v1/labs/validate` | Submit answer (marks as pending) |
| `GET` | `/api/v1/labs/progress/{course_id}/{chapter_id}` | Chapter progress |
| `GET` | `/api/v1/labs/progress/{course_id}` | Full course progress |

> **Note:** The labs router is a legacy layer. Lab container management is now handled by the orchestrator. This router tracks session metadata in Firestore.

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
  "slug": "string",
  "modules": 4,
  "labs": 10,
  "level": "beginner",
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
    "module-1": { "lab-1": "completed", "lab-2": "completed" }
  },
  "lastAccessed": "Timestamp",
  "status": "in-progress"
}
```

### `chapter_progress/{uid}_{courseId}_{chapterId}`
```json
{
  "user_id": "string",
  "course_id": "string",
  "chapter_id": "string",
  "answers": { "q1": "correct", "q2": "incorrect" },
  "status": "in_progress",
  "created_at": "Timestamp"
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CREDENTIALS_JSON` | No* | Service account JSON string |
| `FIREBASE_CREDENTIALS_PATH` | No* | Path to service account file |
| `GOOGLE_APPLICATION_CREDENTIALS` | No* | Standard Google auth variable |
| `CONTENT_DIR` | No | Path to content directory (default: `../content`) |

*Firebase credentials: tries `FIREBASE_CREDENTIALS_JSON` → `FIREBASE_CREDENTIALS_PATH` → `GOOGLE_APPLICATION_CREDENTIALS` → local `credentials.json` → Application Default

## Local Development

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Seed Course Data

```bash
python -m app.scripts.seed_courses
```

Reads `content/index.json` and each `course.json`, computes module/lab counts, upserts into Firestore `courses` collection. Idempotent — safe to run multiple times.

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI entry point
│   ├── core/
│   │   ├── firebase_config.py  # Admin SDK initialization
│   │   ├── firestore_db.py     # Firestore client
│   │   └── credentials.json    # Service account key (gitignored)
│   ├── models/
│   │   ├── user.py             # UserProfile, UserSyncResponse
│   │   ├── course.py           # Course, Enrollment
│   │   └── lab.py              # LabSession, progress models
│   ├── routers/
│   │   ├── users.py            # User sync, profile
│   │   ├── courses.py          # Enrollment, progress
│   │   └── labs.py             # Lab session metadata (legacy)
│   ├── scripts/
│   │   └── seed_courses.py     # Firestore seeder
│   └── utils/
│       └── firebase_util.py    # Token verification dependency
├── Dockerfile
└── requirements.txt
```
