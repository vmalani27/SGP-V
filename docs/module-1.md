# Module 1 — Authentication, Backend & Data Model

## Scope
Set up the full-stack project scaffold with Firebase Authentication, FastAPI backend, Firestore data layer, route protection, and the initial set of UI pages.

## What Was Built

### Project Architecture
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend:** FastAPI with Firebase Admin SDK token verification
- **Database:** Firebase Firestore (users, courses, enrollments)
- **Auth Provider:** Firebase Authentication (email/password)

### Authentication — Backend (`app/`)
- Firebase ID token verified via Admin SDK with 120s clock skew tolerance
- Open CORS for local development
- `GET /health` health check endpoint

### Authentication — Frontend (`next-app/`)
- Firebase client SDK initialized with env vars, guarded against SSR
- Auth Context (`useAuth`) — provides `user`, `loading`, `isAuthenticated`, `login`, `register`, `logout`
- User sync — automatically calls `POST /api/v1/users/sync` on auth state change
- Session cookie set/cleared on auth state change for middleware route protection
- Firebase error codes mapped to user-friendly messages
- Login (`/login`) and Register (`/register`) pages with split-screen layout

### Route Protection
- `app/middleware.ts` — redirects unauthenticated users from `/dashboard` and `/onboarding` to `/login`; redirects authenticated users away from `/login` and `/register`
- Client-side `useEffect` guard on `/dashboard` as a secondary check

### API Layer (`next-app/lib/api.ts`)
- `apiFetch()` — generic fetch wrapper that auto-attaches Firebase ID token as Bearer header
- Typed helpers:
  - Users: `sync()`, `me()`, `updateProfile()`, `enrollments()`
  - Courses: `list()`, `get()`, `enroll()`, `progress()`

### API Endpoints (`app/`)
| Endpoint | Description |
|---|---|
| `POST /api/v1/users/sync` | Creates Firestore user doc on first login, updates `lastLogin` on return |
| `GET /api/v1/users/me` | Returns authenticated user's profile |
| `PUT /api/v1/users/me` | Updates `displayName` and `profileComplete` |
| `GET /api/v1/users/me/enrollments` | Lists user's course enrollments |
| `GET /api/v1/courses/` | Lists all courses from Firestore |
| `GET /api/v1/courses/{id}` | Returns single course details |
| `POST /api/v1/courses/{id}/enroll` | Enrolls user in a course |
| `GET /api/v1/courses/{id}/progress` | Returns enrollment progress |

### Data Model (Firestore)

**`users/{uid}`**
```json
{
  "uid": "string",
  "email": "string",
  "displayName": "string",
  "createdAt": "Timestamp",
  "lastLogin": "Timestamp",
  "enrolledCourses": ["courseId1", "courseId2"],
  "profileComplete": "boolean"
}
```

**`courses/{courseId}`**
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "slug": "string",
  "modules": "number",
  "labs": "number",
  "level": "string",
  "createdAt": "Timestamp"
}
```

**`enrollments/{userId}_{courseId}`**
```json
{
  "userId": "string",
  "courseId": "string",
  "enrolledAt": "Timestamp",
  "progress": {},
  "lastAccessed": "Timestamp",
  "status": "in-progress | completed"
}
```

### Pages & UI
| Page | Route | Description |
|---|---|---|
| Landing | `/` | Hero with auth-aware CTA, value props, learning path cards |
| Login | `/login` | Split-screen with email/password form, animating node background |
| Register | `/register` | Split-screen with name/email/password form |
| Onboarding | `/onboarding` | 2-step flow: confirm name → pick course to enroll in |
| Dashboard | `/dashboard` | Welcome message, enrolled courses with progress bars, course catalog |

### UI Components (`next-app/components/`)
- `Navbar` — sticky nav with auth-aware links (Login/Start Free or Dashboard/Log Out)
- `Footer` — "Built by DevOps Engineers, for Developers"
- `TerminalDemo` — stylized terminal showing `git rebase` and `docker build` commands

### Seed Script
- `app/scripts/seed_courses.py` — one-time script to seed Git Fundamentals and Docker Mastery courses into Firestore

### Packages Added
- `firebase`, `react-markdown`, `remark-gfm`, `@tailwindcss/typography`
