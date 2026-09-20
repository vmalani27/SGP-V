# Frontend (Next.js)

The UI layer for LabOps. Handles local developer/student profiles, course browsing, the chapter and lab players, and the interactive lab terminal experience.

LabOps runs **100% local-first**:
- **User Progress & State**: Persisted to the host machine at `~/.labops/user_state.json` (mounted to `/app/.user_data`). No cloud database (Firebase / Firestore) required.
- **Course Content**: Synced from CloudFront CDN or bundled locally to `~/.labops/content` (mounted read-only at `/app/.content`). Served directly from disk via Next.js local content APIs.
- **Lab Containers & Terminal**: The browser connects directly to the orchestrator via the local Nginx proxy (`/labs/*`, `/demos/*`, `/ws/terminal`). There is no intermediate cloud backend in the lab execution path.

---

## What It Does

| Responsibility | Implementation |
|---|---|
| **Local User State** | `lib/user-store.ts` reads/writes user profiles, course enrollments, chapter completions, and lab progress directly to `user_state.json`. |
| **Local Content Serving** | `lib/content-local.ts` and `lib/content-server.ts` read `catalog.json`, courses, modules, chapters, and lab definitions directly from `/app/.content`. |
| **Course Catalog & TOC** | Served locally via `/api/local-content/catalog` and `/api/local-content/courses/[id]`. |
| **Chapter Viewer** | Interactive slide reader (`SlideReader.tsx`), markdown theory rendering, comprehension quizzes (`QuizSection.tsx`), and guided inline demos (`DemoTerminal.tsx`). |
| **Lab Lifecycle & Execution** | Provisioning state machine (`LabBriefing.tsx` → `ProvisioningBoot.tsx` → `LabClient.tsx`), calling the local orchestrator API (`POST /labs/{id}/exec`, `POST /labs/{id}/lifecycle`). |
| **Interactive Terminal** | High-performance xterm.js terminal with auto-fit, OSC 52 copy/paste, and WebSocket connection directly to the orchestrator (`/ws/terminal`). |
| **Task Validation** | Evaluates tasks (`multiple_choice`, `terminal_action`, `port_check`). Validation commands execute securely inside the student's lab container via `POST /labs/{id}/exec`, with validation logic matching client-side. |

---

## Architecture & Data Flow

```
   ┌─────────────────────────────────────────────────────────┐
   │                     Host Filesystem                     │
   │   ~/.labops/content                 ~/.labops/user_state │
   └──────────┬──────────────────────────────────┬───────────┘
              │ (:ro)                            │ (:rw)
              ▼                                  ▼
   ┌─────────────────────────────────────────────────────────┐
   │                   Next.js Frontend                      │
   │  (/app/.content)                   (/app/.user_data)    │
   │                                                         │
   │  • lib/content-local.ts            • lib/user-store.ts  │
   │  • /api/local-content/*            • /api/user/*        │
   └─────────────▲─────────────────────────────▲─────────────┘
                 │                             │
                 │ HTTP (localhost:3000)       │
                 ▼                             │
   ┌───────────────────────────┐               │
   │   Student Web Browser     ├───────────────┘
   │   • UI / Course Player    │
   │   • Task Runner           │
   │   • xterm.js Terminal     │
   └─────────────┬─────────────┘
                 │ WebSocket & REST via Reverse Proxy
                 ▼
   ┌───────────────────────────┐
   │    LabOps Orchestrator    │
   │    • Docker / Sysbox      │
   │    • Container Lifecycle  │
   │    • Interactive Shells   │
   └───────────────────────────┘
```

---

## Validation Flow

Client-driven, but verification commands run **inside the student's lab container via the orchestrator**:

1. Frontend reads lab tasks from local content (`/api/local-content/labs/{id}/tasks`).
2. Renders the active task (`multiple_choice`, `terminal_action`, or `port_check`).
3. Student enters their answer, completes actions in the terminal, or starts a required service.
4. Frontend requests validation by dispatching `command` to `POST /labs/{sessionId}/exec` via the orchestrator.
5. Orchestrator executes the test as the configured user (`student`) and returns `{exit_code, output}`.
6. The frontend verifies the exit code, regex pattern, exact match, or output line count.
7. Upon successful completion of all tasks:
   - State updates locally in `user_state.json`.
   - The lab container is cleanly torn down via `DELETE /labs/{sessionId}`.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router, standalone output)
- **UI Components**: React 19, TypeScript, Tailwind CSS 3, Lucide React
- **Terminal**: xterm.js + WebLinks addon + Fit addon + OSC 52 clipboard integration
- **Content Parsing**: `js-yaml` for YAML metadata, customized Markdown slide parser
- **Storage**: Node.js filesystem I/O for `user_state.json` and static content files

---

## Local Development Setup

```bash
cd next-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

Default configuration is provided in `.env.sample`:

```env
# Orchestrator Configuration
NEXT_PUBLIC_ORCHESTRATOR_URL=              # Leave blank when behind Nginx reverse proxy (same-origin)
INTERNAL_ORCHESTRATOR_URL=http://orchestrator:8000
NEXT_PUBLIC_ORCHESTRATOR_SECRET=local-dev-super-secret

# Local Storage Paths
USER_DATA_DIR=/app/.user_data              # Directory containing user_state.json
CONTENT_LOCAL_DIR=/app/.content            # Directory containing unpacked courses & catalog.json
```

---

## Key Files & Directory Structure

```
next-app/
├── app/
│   ├── api/
│   │   ├── local-content/                 # Local filesystem content APIs (catalog, courses, labs)
│   │   └── user/                          # User state & progress endpoints
│   ├── courses/[courseId]/                # Course syllabus, module tree, and chapter player
│   │   ├── chapters/[chapterId]/page.tsx
│   │   └── labs/[labId]/page.tsx          # Lab briefing, provision boot, and xterm terminal
│   ├── dashboard/page.tsx                 # Enrolled courses and catalog overview
│   ├── login/page.tsx, register/page.tsx  # Local profile & switch user flows
│   ├── layout.tsx, globals.css
│   └── middleware.ts
├── components/
│   ├── ChapterClient.tsx                  # Markdown slide renderer
│   ├── LabClient.tsx                      # Lab lifecycle state coordinator
│   ├── LabTerminal.tsx                    # xterm.js WebSocket terminal component
│   ├── LabTaskRenderer.tsx                # Task step-through engine
│   └── ...
├── lib/
│   ├── user-store.ts                      # Local user profile & course/lab progress manager
│   ├── content-local.ts                   # Reads local content directory (YAML + markdown)
│   ├── content-server.ts                  # Server-side catalog / course helper
│   ├── task-types.ts                      # Task validation interfaces
│   └── api.ts                             # Orchestrator and local content API clients
├── Dockerfile
└── package.json
```