# Frontend (Next.js)

The UI layer for LabOps. Handles authentication, course browsing, chapter viewing, and the lab terminal experience.

## What It Does

| Responsibility | How |
|----------------|-----|
| Auth flow | Firebase client SDK (login/register/session) |
| Course catalog | Fetches from backend API, displays with enrollment status |
| Chapter viewer | Renders markdown theory + embedded quizzes |
| Lab viewer | Resizable panels: instructions + xterm.js terminal |
| Terminal | WebSocket to orchestrator (`WS /ws/{id}/terminal`) |
| Progress tracking | Calls backend API to mark labs complete |

## What It Does NOT Do

- Store course content — reads from orchestrator's content API
- Manage containers — sends commands to orchestrator
- Verify auth tokens — backend does that with Admin SDK
- Track progress in Firestore — backend does that

## Current State

The frontend currently:
- Reads course structure from static files via `lib/content-server.ts` (SSG)
- Has a complete orchestrator client (`lib/orchestrator.ts`) ready to connect
- Has a lab session hook (`hooks/useLabSession.ts`) for container lifecycle
- Has xterm.js terminal integration (`components/TerminalPane.tsx`)
- Has placeholder validation (marks as "pending")

**Target:** Switch to orchestrator's content API for all course data, build the lab.yaml task wizard.

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
NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:8001
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
| `/courses/[courseId]/labs/[labId]` | Yes | Lab instructions + terminal |

## Key Components

| Component | Purpose |
|-----------|---------|
| `Navbar.tsx` | Top nav with auth-aware buttons |
| `LearningPlayer.tsx` | Full-screen chapter layout with sidebar |
| `ChapterClient.tsx` | Orchestrates theory → quiz → completion |
| `QuizSection.tsx` | Interactive quiz with client-side grading |
| `LabTerminal.tsx` | Terminal controls (start/stop/destroy) |
| `TerminalPane.tsx` | xterm.js integration + validation tab |
| `CourseCurriculum.tsx` | Module accordion with progress |
| `PlayerSidebar.tsx` | Navigation with completion status |

## Key Files

| File | Purpose |
|------|---------|
| `lib/firebase.ts` | Firebase client SDK init |
| `lib/auth-context.tsx` | AuthProvider + useAuth hook |
| `lib/api.ts` | Backend API client with auto-auth |
| `lib/orchestrator.ts` | Orchestrator REST + WebSocket client |
| `lib/content-server.ts` | SSG content reader (filesystem) |
| `lib/content-types.ts` | TypeScript interfaces |
| `hooks/useLabSession.ts` | Lab lifecycle hook (start/stop/validate) |
| `middleware.ts` | Route protection (redirects) |

## Architecture Notes

### Two Data Sources

The frontend currently reads from two sources:

1. **Filesystem** (`lib/content-server.ts`) — For SSG at build time. Reads `content/` directory directly.
2. **Orchestrator API** (`lib/orchestrator.ts`) — For runtime. Calls `GET /courses`, `POST /labs`, etc.

**Target:** Phase out filesystem reads. Use orchestrator API for everything.

### Validation Flow (Target)

```
1. Frontend reads lab.yaml (from orchestrator API)
2. Renders task prompt from lab.yaml
3. Student types command in terminal
4. Student clicks "Check"
5. Frontend sends POST /labs/{id}/exec { command: task.validation.command }
6. Orchestrator runs command in container, returns output
7. Frontend compares output to task.validation.expected_output
8. Uses match_type (contains/exact/regex/line_count)
9. Pass → unlock next task. Fail → show error_message + hint.
```

## Project Structure

```
next-app/
├── app/
│   ├── layout.tsx              # Root layout + AuthProvider
│   ├── page.tsx                # Landing page
│   ├── middleware.ts           # Route protection
│   ├── globals.css             # Tailwind + dark theme
│   ├── login/page.tsx          # Login
│   ├── register/page.tsx       # Register
│   ├── onboarding/page.tsx     # Onboarding
│   ├── dashboard/page.tsx      # Dashboard
│   └── courses/
│       └── [courseId]/
│           ├── page.tsx        # Course detail (SSG)
│           ├── CourseCurriculum.tsx
│           ├── CourseAccordion.tsx
│           ├── CourseProgressHeader.tsx
│           ├── chapters/
│           │   └── [chapterId]/page.tsx   # Chapter viewer (SSG)
│           └── labs/
│               └── [labId]/page.tsx       # Lab viewer (SSG)
├── components/
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── TerminalDemo.tsx
│   ├── LearningPlayer.tsx
│   ├── PlayerSidebar.tsx
│   ├── ChapterClient.tsx
│   ├── TheorySection.tsx
│   ├── QuizSection.tsx
│   ├── LabTerminal.tsx
│   ├── TerminalPane.tsx
│   ├── LabInstructions.tsx
│   └── MarkCompleteButton.tsx
├── hooks/
│   └── useLabSession.ts
├── lib/
│   ├── firebase.ts
│   ├── auth-context.tsx
│   ├── api.ts
│   ├── orchestrator.ts
│   ├── content-server.ts
│   ├── content-types.ts
│   └── labs-api.ts
├── Dockerfile
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.mjs
```
