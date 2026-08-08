# Frontend (Next.js)

The UI layer for LabOps. Handles authentication, course browsing, chapter viewer, and the lab terminal experience.

## What It Does

| Responsibility | How |
|----------------|-----|
| Auth flow | Firebase client SDK (login/register/session) |
| Course catalog | Fetches from backend API, displays with enrollment status |
| Chapter viewer | Renders markdown theory + embedded quizzes |
| Lab viewer | Intro → provision → running with task runner, xterm.js terminal, and toolbar (pause/resume/restart/destroy) |
| Task runner | Renders `multiple_choice`, `terminal_action`, `port_check` tasks; validates via backend |
| Terminal | WebSocket to backend proxy (`WS /api/v1/labs/ws/lab`), JWT sent as first message; backend bridges to orchestrator |
| Submit flow | Success animation per correct answer; Submit Lab modal records completion, destroys the container, returns to course |
| Progress tracking | Calls backend API to mark chapters complete + labs complete |

## What It Does NOT Do

- Store course content — reads from backend's content API
- Manage containers — sends commands to orchestrator via backend proxy
- Verify auth tokens — backend does that with Admin SDK
- Track progress in Firestore — backend does that

## Data Source

The frontend reads all data from the **backend API** (`localhost:8000`), never from the orchestrator directly:

```
Frontend → Backend (content + lab proxy) → Orchestrator (container exec)
                                         → Firestore (user data via backend)
```

- **Course content** (TOC, chapters, lab instructions, tasks): `GET /api/v1/content/...`
- **Lab lifecycle**: `POST /api/v1/labs/courses/{id}/labs/{labId}/start` (backend proxies to orchestrator)
- **Command execution**: `POST /api/v1/labs/courses/{id}/labs/{labId}/exec/{sid}`
- **WebSocket terminal**: the browser connects to the backend's own WS endpoint (`ws://{backend}/api/v1/labs/ws/lab`) and sends the JWT as the **first message** (`{"type":"auth","token":...}`) — never in the URL. The backend bridges frames to the orchestrator's internal `/ws/terminal`. The orchestrator's address is never exposed to the browser.

## Validation Flow

Server-validated (backend runs the command in the container; answers never leave the container):

```
1. Frontend reads lab tasks (GET /api/v1/content/courses/{id}/labs/{labId}/tasks)
2. Renders the current task (multiple_choice / terminal_action / port_check)
3. Student answers (select an option, type a command in the terminal, or clicks "Check")
4. Frontend sends POST /api/v1/labs/courses/{id}/labs/{labId}/validate { task_id, answer }
5. Backend runs the validation command in the container via the orchestrator and matches output server-side (contains/exact/regex/port)
6. Correct → success animation, then advance to the next task
7. Incorrect → show error_message + hint; student retries
8. All tasks complete → Submit Lab modal → records lab completion + destroys the container → returns to course
```

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS 3
- xterm.js v6 (terminal)
- Firebase client SDK
- react-markdown + remark-gfm

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
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Pages

| Route | Auth | Description |
|-------|------|-------------|
| `/` | No | Landing page with hero + value props |
| `/login` | No | Email/password login |
| `/register` | No | Email/password register |
| `/onboarding` | Yes | Confirm display name |
| `/dashboard` | Yes | My courses + browse courses |
| `/courses/[courseId]` | Yes | Course detail with curriculum accordion |
| `/courses/[courseId]/chapters/[chapterId]` | Yes | Theory + quiz viewer |
| `/courses/[courseId]/labs/[labId]` | Yes | Lab instructions + terminal + tasks |

## Key Components

| Component | Purpose |
|-----------|---------|
| `Navbar.tsx` | Top nav with auth-aware buttons |
| `LearningPlayer.tsx` | Full-screen chapter layout with sidebar |
| `ChapterClient.tsx` | Orchestrates theory → quiz → completion |
| `QuizSection.tsx` | Interactive quiz with client-side grading |
| `LabTerminal.tsx` | xterm.js WebSocket terminal with auto-fit + remote PTY resize |
| `LabTaskRenderer.tsx` | Steps through lab tasks; shows "Lab Complete" state |
| `MultipleChoiceTask.tsx` | Multiple-choice task card (server-validated options) |
| `TerminalActionTask.tsx` | Run-a-command task card (validates in container) |
| `PortCheckTask.tsx` | Port/path check task card |
| `TaskProgress.tsx` | Task progress indicator (n/total) |
| `CelebrationOverlay.tsx` | CSS confetti/checkmark animation on correct answers |
| `SubmitLabModal.tsx` | Submit Lab modal on completion (record + destroy + return to course) |
| `CourseCurriculum.tsx` | Module accordion with progress (incl. completed labs) |
| `PlayerSidebar.tsx` | Navigation with completion status |

## Key Files

| File | Purpose |
|------|---------|
| `lib/firebase.ts` | Firebase client SDK init |
| `lib/auth-context.tsx` | AuthProvider + useAuth hook |
| `lib/api.ts` | Backend API client with auto-auth |
| `lib/task-types.ts` | Lab task / progress / validation types |
| `lib/content-server.ts` | SSG content reader (build-time) |
| `lib/content-types.ts` | Course content TypeScript interfaces |
| `app/courses/[courseId]/labs/[labId]/page.tsx` | Lab page: phases, task runner, toolbar, submit flow |
| `middleware.ts` | Route protection (redirects) |

## Project Structure

```
next-app/
├── app/
│   ├── layout.tsx              # Root layout + AuthProvider
│   ├── page.tsx                # Landing page
│   ├── middleware.ts           # Route protection
│   ├── globals.css             # Tailwind + dark theme
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── onboarding/page.tsx
│   ├── dashboard/page.tsx
│   └── courses/
│       └── [courseId]/
│           ├── page.tsx        # Course detail
│           ├── CourseAccordion.tsx
│           ├── CourseCurriculum.tsx
│           ├── CourseProgressHeader.tsx
│           ├── chapters/
│           │   └── [chapterId]/page.tsx
│           ├── quizzes/
│           │   └── [quizId]/page.tsx
│           └── labs/
│               └── [labId]/page.tsx       # Lab viewer + tasks + terminal
├── components/
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── CourseSidebar.tsx
│   ├── CourseTopBar.tsx
│   ├── LearningPlayer.tsx
│   ├── PlayerSidebar.tsx
│   ├── ChapterClient.tsx
│   ├── TheorySection.tsx
│   ├── QuizSection.tsx
│   ├── LabTerminal.tsx
│   ├── LabTaskRenderer.tsx
│   ├── MultipleChoiceTask.tsx
│   ├── TerminalActionTask.tsx
│   ├── PortCheckTask.tsx
│   ├── TaskProgress.tsx
│   ├── CelebrationOverlay.tsx
│   ├── SubmitLabModal.tsx
│   ├── MarkCompleteButton.tsx
│   └── PaginationNav.tsx
├── lib/
│   ├── firebase.ts
│   ├── auth-context.tsx
│   ├── api.ts
│   ├── task-types.ts
│   ├── content-server.ts
│   └── content-types.ts
├── Dockerfile
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.mjs
```
