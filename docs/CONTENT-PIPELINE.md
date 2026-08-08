# Content Pipeline (`content-v2/`)

End-to-end reference for the course content system: how `content-v2/` is
structured, validated, seeded into Firestore, served by the backend, and
rendered by the frontend.

## Data flow

```
content-v2/  (single source of truth, mounted read-only as /app/content)
    │
    ├──→  Worker  (validator.py + seeder.py)
    │         1. validate_all()           — schema checks (errors vs warnings)
    │         2. sync_courses()           — idempotent upsert to Firestore `courses`
    │            (every 300s; also POST /sync on the worker to trigger manually)
    │
    ├──→  Backend  (content_provider.py + routers/content.py)
    │         GET /api/v1/content/...     — TOC, chapters, lab instructions, tasks
    │         GET /api/v1/labs/...        — lab lifecycle proxy → orchestrator
    │
    └──→  Frontend  (Next.js)
              /courses/[courseId]         — curriculum from course TOC
              /chapters/[chapterId]       — markdown theory
              /labs/[labId]               — intro → provision → tasks + terminal
```

Orchestrator never reads content files. It only runs containers and executes
commands the backend sends.

---

## 1. Folder layout (canonical)

```
content-v2/
  index.json                                # course catalog
  environments/
    {name}.yaml                             # shared env defs (docker-basic, linux-basic)
  courses/{course-id}/
    course.yaml                             # course TOC — ordered module refs
    modules/{module-id}/
      module.yaml                           # module TOC — ordered `items`
      chapters/{chapter-id}.md              # theory markdown
      labs/{lab-id}/
        lab.yaml                            # tasks + environment reference
        instructions.md                     # lab intro markdown
```

This is the only format the validator, seeder, backend, and frontend read.
There is no `course.json`, no monolithic `lab-N.yaml`, no inline environment
dict.

---

## 2. File templates

### `index.json` — course catalog

```json
{
  "version": "2.0",
  "courses": [
    {
      "id": "git-fundamentals",
      "title": "Git Fundamentals",
      "description": "From your first commit to advanced branching strategies and CI/CD integration.",
      "level": "beginner"
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `version` | yes | `"2.0"` |
| `courses[].id` | yes | lowercase alphanumeric + hyphens; unique |
| `courses[].title` | yes | |
| `courses[].description` | yes | |
| `courses[].level` | yes | `beginner` \| `intermediate` \| `advanced` |

### `courses/{id}/course.yaml` — course TOC

```yaml
id: git-fundamentals
title: Git Fundamentals
description: From your first commit to advanced branching strategies and CI/CD integration.
level: beginner
modules:
  - git-basics
  - branching-history
  - remote-collaboration
  - complete-workflow
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | must equal the directory name |
| `title` | yes | |
| `description` | yes | |
| `level` | yes | |
| `modules` | yes | array of module IDs; each must resolve to `modules/{id}/module.yaml` |

### `courses/{id}/modules/{mod}/module.yaml` — module TOC

```yaml
id: git-basics
title: Git Basics
description: Learn the core concepts of version control and Git basics.
order: 1
items:
  - type: chapter
    id: chapter-1
  - type: lab
    id: lab-1
  - type: chapter
    id: chapter-2
  - type: lab
    id: lab-2
  - type: chapter
    id: chapter-3
  - type: lab
    id: lab-3
```

`items` is the **linear learning path** — chapters and labs interleave in the
exact order the student sees them. `chapters` and `labs` arrays are derived
from `items` by the validator, seeder, and backend; never declare them
manually.

### `chapters/{id}.md` — theory markdown

Plain markdown. The first `# ` heading is used as the chapter **title**
(shown in the curriculum and sidebar) when the module item has no explicit
title.

### `labs/{lab-id}/lab.yaml` — lab definition

```yaml
id: lab-1
title: Hello World Container
difficulty: beginner
estimated_time: 10
xp: 50
tags: [docker, containers, fundamentals]
objectives:
  - Inspect the local image cache
  - Run a simple container
environment: docker-basic
tasks:
  - id: access-daemon
    title: Can you access the Docker daemon?
    prompt: Can you access the Docker daemon right now? Run `docker ps` to find out.
    type: multiple_choice
    options: [Yes, No]
    validation:
      command: "docker ps >/dev/null 2>&1 && echo Yes || echo No"
      match_type: exact
    error_message: Docker should refuse the connection for now.
    hint: Run `docker ps` and read the error message.

  - id: count-images
    title: Count images
    prompt: How many images are present in the system?
    type: terminal_action
    validation:
      command: "docker images -q | wc -l | tr -d ' '"
      match_type: exact
      expected_output: "2"

completion:
  required_tasks: all
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | matches the directory name |
| `title` | yes | shown in curriculum; fallback = first `# ` of `instructions.md` (worker) / the id (backend) |
| `difficulty` | no | `beginner` \| `intermediate` \| `advanced` |
| `estimated_time` | no | minutes (not currently rendered) |
| `xp` | no | experience points (not currently rendered) |
| `tags` | no | string[] |
| `objectives` | no | string[] — shown on the lab intro page |
| `environment` | yes | string reference → `environments/{name}.yaml` |
| `setup` | no | `[{command}]` reset commands |
| `tasks` | no | if absent/empty the lab is a **skeleton** (allowed, warning only) |
| `completion` | no | `{required_tasks: all}` or a list of task IDs |

#### Task types

| Type | What the student does | Required `validation` fields |
|------|-----------------------|------------------------------|
| `multiple_choice` | picks from `options` | `expected_output` (static) **or** `command` (dynamic via `options_source: dynamic`) |
| `terminal_action` | runs a command, clicks Check | `command` + `expected_output` |
| `port_check` | checks a port/path | `command` (currently) or `port`/`path` |
| `file_check` | creates/edits a file | `path` + `contains` (backend-supported; not yet authored or rendered) |

Common task fields: `id` (required), `prompt` (required), `title`,
`description`, `type`, `options`, `options_source`, `validation`,
`error_message`, `hint`.

#### `validation.match_type` (backend `_match_output`)

| Value | Behavior |
|-------|----------|
| `contains` (default) | expected string is a substring of output |
| `exact` | output matches exactly (after trimming) |
| `regex` | regex search on output |
| `line_count` | output has exactly N lines |

**No static answers leave the server.** Expected output lives in `lab.yaml`;
comparison happens in the backend inside the running container context.

### `labs/{lab-id}/instructions.md` — lab intro

Markdown shown on the lab intro page before the student starts. The first
`# ` heading is the lab title fallback. Recommended sections: What You're
Doing and Why, Background, Command Reference, Scenario, Objective,
Reflection.

### `environments/{name}.yaml` — shared environment definitions

```yaml
# docker-basic.yaml
base_image: "sgp-lab-docker:latest"
pre_pull:
  - nginx:alpine
  - alpine:latest
```

```yaml
# linux-basic.yaml
base_image: sgp-lab-ubuntu:latest
apt_packages:
  - git
```

Fields consumed by the backend lab `start` endpoint: `base_image`
(required), `apt_packages`, `pre_pull`. Base images are built from
`orchestrator/lab-images/`.

---

## 3. Title & order resolution

Ordering always comes from `module.yaml` `items`. Titles are resolved at read
time (never stored in `module.yaml`):

| Item | Title source (in order) |
|------|--------------------------|
| Chapter | first `# ` heading of `chapters/{id}.md` → `id` |
| Lab | `lab.yaml` `title` → first `# ` of `instructions.md` (worker only) → `id` |

---

## 4. Validation (`worker/app/validator.py`)

`validate_all(content_dir)` runs on the worker at startup, every
`SYNC_INTERVAL_SECONDS` (default 300s), and on `POST /sync`. It checks:

**`index.json`** — parses, requires `courses[]`, each entry has
`id`/`title`/`description`/`level`; ids are lowercase-hyphen, unique, valid
`level` enum.

**Course TOC** — `course.yaml` has `id`/`title`/`description`/`level`/
`modules`; `id` matches the directory; each module ref resolves to
`modules/{ref}/module.yaml`; each `items[]` entry has `type` (`chapter`/`lab`)
and `id`; every chapter has a `chapters/{id}.md`; every lab has
`labs/{id}/instructions.md`.

**Lab YAML** — `environment` is a non-empty string and resolves to
`environments/{name}.yaml`; per-type task `validation` requirements
(`file_check` needs `path` + `contains`; `port_check` needs `port`/`path`;
other types need `command`).

**Errors vs warnings**

- **Error** → seed is blocked (`/status` shows `validation_failed`).
- **Warning** → seed proceeds. Current warnings: module ref without
  `module.yaml`, missing `lab.yaml` for a lab, environment ref that doesn't
  resolve, and skeleton labs (no `tasks`).

Run it standalone:

```bash
cd worker
python -c "from pathlib import Path; from app.validator import validate_all; r=validate_all(Path('content-v2')); [print('ERROR', e) for e in r.errors]; [print('WARN', w) for w in r.warnings]; print('ok' if r.ok else 'FAILED')"
```

Current state: 0 errors, 16 skeleton warnings (git labs 2–10, docker labs 4–10).

---

## 5. Seeding to Firestore (`worker/app/seeder.py`)

`sync_courses(db)` reads `index.json`, then for each course reads
`course.yaml` → `module.yaml` → titles, and upserts a `courses` document.

- **`contentHash`** = sha256 over `course.yaml` + all `module.yaml` +
  all `lab.yaml` (chapter markdown is intentionally excluded). If the hash
  matches the existing Firestore doc, the course is **skipped** (idempotent).
- **Document shape**: `{id, title, description, slug, level, modules:[{
  id, title, description, order, chapters:[{id,title,description,order}],
  labs:[{id,title,description,chapterId,order}] }], totalChapters,
  totalLabs, contentHash, updatedAt}` (+ `createdAt` on first write).
- **Orphan cleanup**: Firestore courses not in `index.json` are deleted.
- Cadence: on startup, then every `SYNC_INTERVAL_SECONDS`.

Check the worker: `GET /status` on the worker service, or `POST /sync` to
force a cycle.

---

## 6. Serving — backend content API

Backend is the only content server (via `ContentProvider` —
`FilesystemProvider` today, `S3Provider` future). Resolving a course builds
`items`/`chapters`/`labs` from `module.yaml` and resolves titles (see §3);
lab configs get `lab_id`/`module_id` injected and `environment` replaced by
the parsed `environments/{ref}.yaml`.

| Endpoint | Returns |
|----------|---------|
| `GET /api/v1/content/courses` | catalog (from `index.json`) |
| `GET /api/v1/content/courses/{id}` | course TOC with modules, items, chapters, labs |
| `GET /api/v1/content/courses/{id}/chapters/{chapterId}` | `{chapter, content}` |
| `GET /api/v1/content/courses/{id}/labs` | flat lab list |
| `GET /api/v1/content/courses/{id}/labs/{labId}/instructions` | `{lab_id, title, module_id, chapter_id, instructions}` |
| `GET /api/v1/content/courses/{id}/labs/{labId}/tasks` | `{lab_id, tasks}` (unauthenticated) |
| `GET /api/v1/content/courses/{id}/labs/{labId}/config` | full lab config, env resolved |

**Lab runtime (proxy to orchestrator)** — `backend/app/routers/labs.py`:

- `POST .../start` reads `lab.yaml` config, pulls `base_image`/
  `apt_packages`/`pre_pull` from the resolved env, and calls the orchestrator.
- `GET .../tasks` (authed) returns tasks; for dynamic multiple-choice it runs
  the validation `command` in the container and builds the option list.
- `POST .../validate` dispatches by `task.type`:
  `multiple_choice` (compare answer to `expected_output` or dynamic output),
  `file_check` (`cat path` contains `contains`), `port_check` (exec command +
  match), default = run `command` and match output.
- `WS /ws/lab` proxies terminal frames to the orchestrator (JWT first message).

---

## 7. Frontend rendering (Next.js)

| Page | Data source | Renders |
|------|-------------|---------|
| `/dashboard` | `GET /content/courses` | catalog cards |
| `/courses/[courseId]` | `GET /content/courses/{id}` | curriculum accordion from module `items` |
| `/courses/[courseId]/chapters/[chapterId]` | `GET /content/chapters/{id}` | markdown via react-markdown |
| `/courses/[courseId]/labs/[labId]` | instructions + `GET .../tasks` | intro → provision → running |

**Lab page phases**: `loading → intro → provisioning → running → error`.

- **intro** — title, a difficulty meter placeholder (time/XP/beginner text are
  intentionally not shown), objectives, instructions, Start Lab.
- **running** — toolbar (pause/resume/restart/destroy) + task renderer +
  terminal (xterm.js over the backend WS proxy).

**Task renderer** (`LabTaskRenderer`) dispatches on `task.type`:
`multiple_choice` → `MultipleChoiceTask`, `terminal_action` →
`TerminalActionTask`, `port_check` → `PortCheckTask`. Each calls
`POST .../validate {task_id, answer}`; correct → success animation + advance,
incorrect → `error_message` + `hint`. All tasks done → Submit Lab modal
records completion and destroys the container.

---

## 8. Authoring workflow

1. Edit files under `content-v2/` (see §2 templates).
2. Run the validator (§4) — fix errors, review warnings.
3. Wait for the worker sync (or `POST /sync`) — check `/status`.
4. Verify in the frontend: course page → chapter → lab.

**Course immutability**: once users are enrolled, structure is append-only —
don't reorder or delete modules/chapters/labs, don't rename IDs. See
`MIGRATION.md` → "Course Immutability Rules".

---

## Related docs

- `README.md` — architecture overview, content tree, API tables
- `backend/README.md` — provider abstraction, backend config
- `next-app/README.md` — frontend structure, validation flow
- `orchestrator/schemas/README.md` — lab authoring guide + JSON Schema
- `MIGRATION.md` — how the canonical format evolved, locked decisions
