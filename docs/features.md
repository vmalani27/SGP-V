# Features Implemented

## Backend (FastAPI)

### Authentication
| Feature | Details |
|---|---|
| Firebase Token Verification | Verifies Firebase ID tokens via Admin SDK with 120s clock skew tolerance |
| CORS | Open CORS for local development |
| Health Check | `GET /` and `GET /health` endpoints |

### User Management (`/api/v1/users`)
| Endpoint | Description |
|---|---|
| `POST /sync` | Creates Firestore user doc on first login, updates `lastLogin` on return |
| `GET /me` | Returns authenticated user's profile |
| `PUT /me` | Updates `displayName` and `profileComplete` |
| `GET /me/enrollments` | Lists user's course enrollments |

### Courses (`/api/v1/courses`)
| Endpoint | Description |
|---|---|
| `GET /` | Lists all courses from Firestore |
| `GET /{id}` | Returns single course details |
| `POST /{id}/enroll` | Enrolls user in a course (updates user doc + creates enrollment doc) |
| `GET /{id}/progress` | Returns enrollment progress |

### Data Seeding
| Script | Description |
|---|---|
| `app/scripts/seed_courses.py` | One-time script to seed Git Fundamentals and Docker Mastery courses |

---

## Frontend (Next.js)

### Authentication
| Feature | Details |
|---|---|
| Firebase Client SDK | Initialized with env vars, guarded against SSR |
| Auth Context (`useAuth`) | Provides `user`, `loading`, `isAuthenticated`, `login`, `register`, `logout` |
| User Sync | Automatically calls `/api/v1/users/sync` on auth state change |
| Session Cookie | Set/cleared on auth state change for middleware route protection |
| Error Handling | Firebase error codes mapped to user-friendly messages |

### Route Protection
| File | Behavior |
|---|---|
| `app/middleware.ts` | Redirects unauthenticated users from `/dashboard` and `/onboarding` to `/login`; redirects authenticated users away from `/login` and `/register` |
| Dashboard check | Client-side `useEffect` also guards `/dashboard` |

### Pages
| Page | Route | Description |
|---|---|---|
| Landing | `/` | Hero section with auth-aware CTA ("Start Learning" / "Continue Learning"), value props, learning path cards fetched from API |
| Login | `/login` | Split-screen layout with email/password form, animating node background |
| Register | `/register` | Split-screen layout with name/email/password form |
| Onboarding | `/onboarding` | 2-step flow: confirm name → pick course to enroll in |
| Dashboard | `/dashboard` | Welcome message with capitalized name, enrolled courses with progress bars, browse/enroll in courses |

### UI Components
| Component | Description |
|---|---|
| `Navbar` | Sticky nav with auth-aware links (Login/Start Free or Dashboard/Log Out) |
| `Footer` | "Built by DevOps Engineers, for Developers" |
| `TerminalDemo` | Stylized terminal showing `git rebase` and `docker build` commands |

### API Client (`lib/api.ts`)
| Feature | Details |
|---|---|
| `apiFetch()` | Generic fetch wrapper that auto-attaches Firebase ID token as Bearer header |
| Typed helpers | `api.users.sync()`, `api.users.me()`, `api.users.updateProfile()`, `api.users.enrollments()`, `api.courses.list()`, `api.courses.get()`, `api.courses.enroll()`, `api.courses.progress()` |

---

## Data Model (Firestore)

### `users/{uid}`
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

### `courses/{courseId}`
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

### `enrollments/{userId}_{courseId}`
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

---

## Seeded Course Data

| Course | Labs | Level |
|---|---|---|
| Git Fundamentals | 10 | Beginner |
| Docker Mastery | 10 | Intermediate |
