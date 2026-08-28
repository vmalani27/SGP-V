# Frontend (Next.js)

The UI layer for LabOps. Handles authentication, course browsing, the chapter
and lab players, and the lab terminal experience. It **bootstraps course
content itself** — it downloads the published artifact from S3, verifies it, and
serves chapters/lab config from a local directory. Backend APIs provide
metadata, auth, and lab proxying.

## What It Does

| Responsibility | How |
|----------------|-----|
| Auth flow | Firebase client SDK (login/register/session) |
| Content bootstrap | `lib/content-local.ts` downloads the S3 artifact, verifies `artifact_sha256`, extracts into a local content dir, writes a version marker |
| Local content serving | Same-origin `/api/local-content/*` routes read chapters / lab instructions / lab config / tasks from the local dir — no backend content calls |
| Catalog + TOC | From the backend's Firestore API (`GET /api/v1/courses`, `/api/v1/courses/{id}`) |
| Chapter viewer | Slides (markdown split on `##`), theory, optional inline `:::terminal-demo` demos, completion |
| Lab viewer | Intro → provision → running with task runner, xterm.js terminal, and toolbar (pause/resume/restart/destroy) |
| Task runner | Renders `multiple_choice`, `terminal_action`, `port_check` tasks; validates via backend |
| Terminal | WebSocket to the backend proxy (`WS /api/v1/labs/ws/lab`), JWT sent as first message; backend bridges to the orchestrator |
| Guided demos | `:::terminal-demo` directives in chapter markdown → backend `/api/v1/demos/*` container + terminal |
| Progress tracking | Calls the backend to mark chapters and labs complete |

## What It Does NOT Do

- Read the backend's files — the backend serves no content
- Manage containers — sends commands to the orchestrator via the backend proxy
- Verify auth tokens — the backend does that with the Admin SDK
- Track progress — the backend owns Firestore

## Data Source

```
content-v2 → CI → S3 (published artifact: latest.json + published/<ver>/content.tar.gz)
                                        │
   Frontend boot: GET /api/v1/content/version  (backend, from Firestore)
        │ version differs from local marker?
        ├─ yes → download tarball → verify sha256 → extract to CONTENT_LOCAL_DIR → write marker
        └─ no  → no-op
Chapters / lab instructions / config / tasks: /api/local-content/* (local disk)
Catalog / TOC: backend /api/v1/courses*
Lab lifecycle: backend /api/v1/labs/... (proxy → orchestrator)
```

### Content bootstrap (`lib/content-local.ts`)

Runs on the Next.js server. On the first content request it calls
`GET /api/v1/content/version`, compares `version` against the local version
marker (`{CONTENT_LOCAL_DIR}/version`), and if changed downloads
`published/{version}/content.tar.gz`, verifies `sha256(gunzip(tarball))` against
`artifact_sha256`, extracts into the content dir, and writes the marker. It also
records the changelog payload so the UI can badge newly added/updated content.
Subsequent requests are a no-op. `lib/content-server.ts` (`getCourseCatalog`,
`getCourse`) reads catalog/TOC from the backend instead.

## Validation Flow

Server-validated (the backend runs the command in the container; matching is
server-side, so answers never reach the browser):

1. Frontend reads lab tasks from its local content (`/api/local-content/labs/{id}/tasks`).
2. Renders the current task (multiple_choice / terminal_action / port_check).
3. Student answers (pick an option, type a command, or follow the terminal flow).
4. Frontend sends `POST /api/v1/labs/courses/{id}/labs/{labId}/validate` with the
   task's **spec** (task_type, validation, error_message, hint) from its local config.
5. Backend runs `validation.command` via the orchestrator and matches
   (exact/contains/regex/line_count, or `expected_exit_code` when present).
6. Correct → success animation → advance. Incorrect → `error_message` + hint → retry.
7. All tasks complete → Submit Lab modal → record completion + destroy container → return to course.

## Pages

| Route | Auth | Description |
|-------|------|-------------|
| `/` | No | Landing page with hero + value props |
| `/login`, `/register` | No | Email/password auth |
| `/onboarding` | Yes | Confirm display name |
| `/dashboard` | Yes | My courses + browse courses |
| `/courses/[courseId]` | Yes | Course detail with curriculum accordion |
| `/courses/[courseId]/chapters/[chapterId]` | Yes | Chapter slides + theory + demos + completion |
| `/courses/[courseId]/labs/[labId]` | Yes | Lab briefing → provisioning → terminal + task runner |

## Key Components

| Component | Purpose |
|-----------|---------|
| `Navbar.tsx` / `Footer.tsx` | Shell chrome |
| `CourseSidebar.tsx` / `CourseTopBar.tsx` | Course layout |
| `CourseCurriculum.tsx` / `CourseProgressHeader.tsx` | Module accordion + progress (incl. completed labs) |
| `LearningPlayer.tsx` / `PlayerSidebar.tsx` | Chapter layout + navigation with completion status |
| `ChapterClient.tsx` / `SlideReader.tsx` / `RichText.tsx` | Chapter slide flow + markdown rendering |
| `QuizSection.tsx` | Static comprehension quiz (client-side grading) |
| `DemoTerminal.tsx` | Guided `:::terminal-demo` container + terminal |
| `LabClient.tsx` / `LabBriefing.tsx` / `ProvisioningBoot.tsx` | Lab state machine: briefing → provision → run |
| `LabTerminal.tsx` | xterm.js WebSocket terminal (auto-fit, resize frames, osc52 paste) |
| `LabTaskRenderer.tsx` | Steps through lab tasks; shows "Lab Complete" state |
| `MultipleChoiceTask.tsx` / `TerminalActionTask.tsx` / `PortCheckTask.tsx` | Task cards |
| `TaskProgress.tsx` / `TaskHelp.tsx` | Task progress indicator + hints |
| `CelebrationOverlay.tsx` | CSS confetti/checkmark on correct answers |
| `SubmitLabModal.tsx` | Submit Lab modal (record + destroy + return) |

## Tech Stack

- Next.js 15 (App Router, standalone output)
- React 19, TypeScript, Tailwind CSS 3
- xterm.js (terminal) + osc52 paste helpers
- Firebase client SDK
- `tar` / `yaml` / `js-yaml` on the server for bootstrap + local content reads

## Setup

```bash
cd next-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local`:

```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# API endpoints
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000   # browser → backend
BACKEND_API_URL=http://backend:8000              # server → backend (compose)

# Content store (server-side)
CONTENT_LOCAL_DIR=/app/.content                  # local artifact dir + version marker
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/firebase.ts` | Firebase client SDK init |
| `lib/auth-context.tsx` | AuthProvider + `useAuth` hook |
| `lib/api.ts` | Backend API client with auto-auth |
| `lib/task-types.ts` | Lab task / progress / validation types |
| `lib/content-types.ts` | Course content TypeScript interfaces |
| `lib/content-server.ts` | Catalog/TOC from backend `/api/v1/courses*` |
| `lib/content-local.ts` | Bootstrap (download/verify/extract/marker) + local content readers |
| `lib/chapter-slides.ts` | Split chapter markdown into slides |
| `lib/demo-directives.ts` | Parse `:::terminal-demo` blocks into demo steps |
| `lib/curriculum.ts` | Flatten progress maps → status + next incomplete item |
| `app/api/local-content/*` | Same-origin routes serving local content |
| `middleware.ts` | Route protection (redirects) |

## Project Structure

```
next-app/
├── app/
│   ├── layout.tsx, page.tsx, middleware.ts, globals.css
│   ├── login/ register/ onboarding/ dashboard/
│   ├── api/local-content/{chapters,labs}/...      # local content routes
│   └── courses/[courseId]/
│       ├── page.tsx, CourseAccordion.tsx, CourseCurriculum.tsx, CourseProgressHeader.tsx
│       ├── chapters/[chapterId]/page.tsx
│       └── labs/[labId]/page.tsx                  # briefing → provision → terminal + tasks
├── components/   # see "Key Components" above
├── lib/          # see "Key Files" above
├── Dockerfile
├── package.json
└── next.config.mjs
```