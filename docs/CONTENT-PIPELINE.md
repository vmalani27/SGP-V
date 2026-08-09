# Content Pipeline (`content-v2/`)

End-to-end reference for the course content system: how `content-v2/` is
structured, validated, published to S3, seeded into Firestore, and consumed
by the worker (cloud) today and by the client app in the target model.

## Current vs target

| Component | Now | Target |
|-----------|-----|--------|
| Validator | `scripts/validate_content.py` (CI gate) + worker re-validation | unchanged |
| Publisher | CI → S3 (`latest.json` + `published/{version}/…`) | unchanged |
| S3 bucket | Floci (dev, host loopback) | public-read S3-compatible bucket |
| Worker | S3-only: download → validate → seed Firestore | unchanged (stays cloud) |
| Backend | serves content files via `FilesystemProvider` (mounted `content-v2`) | pure Firestore API (history/progress/catalog) + `GET /content/version` pointer |
| Frontend | Next.js, fetches content via backend API | client-side, serves from locally extracted content |
| Orchestrator | cloud service, proxies lab lifecycle | client-side, runs labs on the student's docker |

---

## Data flow

### Now

```
content-v2/  (canonical format, source of truth for authoring)
    │
    ├──→  CI  (.github/workflows/publish-content.yml, self-hosted runner)
    │         validate_content.py  →  generate_manifest.py  →  aws s3 sync
    │         ──►  S3 bucket: latest.json + published/{version}/{content.tar.gz, manifest.json}
    │
S3 bucket ──→  Worker  (S3-only; no filesystem mount)
    │            1. download_content()   — fetch latest.json, compare contentVersion,
    │               download tarball, verify artifact_sha256 + per-file hashes,
    │               extract into CONTENT_DIR_S3 (/data/content)
    │            2. validate_all()       — schema checks on the downloaded artifact
    │            3. sync_courses()       — idempotent upsert to Firestore `courses`
    │               (writes contentHash + contentVersion; every 300s, or POST /sync)
    │
    ├──→  Backend  (content_provider.py + routers/content.py)   [transitional]
    │         GET /api/v1/content/...     — TOC, chapters, lab instructions, tasks
    │         GET /api/v1/labs/...        — lab lifecycle proxy → orchestrator
    │         (reads the still-mounted ./content-v2 via FilesystemProvider)
    │
    └──→  Frontend  (Next.js)
              /courses/[courseId]         — curriculum from course TOC
              /chapters/[chapterId]       — markdown theory
              /labs/[labId]               — intro → provision → tasks + terminal
```

### Target (client-side app)

```
content-v2/ ──► CI ──► S3 bucket   (canonical content bytes, public read)

S3 ──► Worker (cloud) ──► Firestore (catalog metadata + contentVersion)
Backend (cloud) = Firestore API: auth, history, progress, catalog
                  + GET /content/version  (current contentVersion, from Firestore)

Student machine — downloaded docker-compose (Linux + docker CLI + sysbox):
  frontend + orchestrator
      startup:  GET /content/version  →  compare with local version marker
                if changed: download {content.tar.gz} from S3 (public read),
                verify artifact_sha256, extract into a local content dir
      frontend:    serves course TOC / chapters / lab instructions from local files
      orchestrator: spawns lab containers from the same local lab.yaml
                    (it receives image/apt_packages/pre_pull/setup in the start
                    request — no orchestrator content access needed)
```

Orchestrator never reads content files. It only runs containers and executes
commands that are sent to it (by the backend today, by the frontend in the
target model).

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
      expected_answer: "No"
    error_message: Docker should refuse the connection for now.
    hint: Run `docker ps` and read the error message.

  - id: count-images
    title: Count images
    prompt: How many images are present in the system?
    type: terminal_action
    validation:
      expected_exit_code: 0
      command: "docker images -q | wc -l | tr -d ' ' | grep -qx 2"

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
| `setup` | no | `[{command}]` run as root at container start, before the student sees the terminal |
| `tasks` | no | if absent/empty the lab is a **skeleton** (allowed, warning only) |
| `completion` | no | `{required_tasks: all}` or a list of task IDs |

#### Task types

| Type | What the student does | Required `validation` fields |
|------|-----------------------|------------------------------|
| `multiple_choice` | picks from `options` | `expected_answer` (static) **or** `command` (dynamic via `options_source: dynamic`) |
| `terminal_action` | runs a command, clicks Check | `command` + (`expected_exit_code` **or** `expected_output`) |
| `port_check` | checks a port/path | `command` (currently) or `port`/`path` |
| `file_check` | creates/edits a file | `path` + `contains` (backend-supported; not yet authored or rendered) |

Common task fields: `id` (required), `prompt` (required), `title`,
`description`, `type`, `options`, `options_source`, `validation`,
`error_message`, `hint`.

#### Answer-based vs state-based validation

There are two kinds of checks, and they must not be confused:

- **Answer-based** — `multiple_choice`. The student submits a choice and the
  backend compares it to `validation.expected_answer` (legacy name
  `expected_output`). The check does **not** execute anything in the container,
  so it stays valid regardless of later lab state.
- **State-based** — `terminal_action` (and `port_check`/`file_check`). The
  backend runs `validation.command` in the container and decides pass/fail from
  the **exit code** (`expected_exit_code`, default `0`) or from its output
  (`expected_output` matched per `match_type`).

Prefer exit-code checks: a command that only exits `0` when the state holds is
self-documenting and can't false-negative on sentinel strings. Never validate an
answer-based task with a state `command` — the command's result can change once
the student completes a later task (e.g. "can you reach Docker?" flips to `Yes`
after they fix the docker group).

#### `validation.match_type` (backend `_match_output`)

| Value | Behavior |
|-------|----------|
| `contains` (default) | expected string is a substring of output |
| `exact` | output matches exactly (after trimming) |
| `regex` | regex search on output |
| `line_count` | output has exactly N lines |

`match_type`/`expected_output` are only consulted when `expected_exit_code` is
absent. With `expected_exit_code`, the match type is ignored entirely.

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

Fields consumed by the lab `start` endpoint: `base_image` (required),
`apt_packages`, `pre_pull`. Base images are built from
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

## 4. Validation

Validation runs in two places:

1. **CI gate (pre-publish)** — `scripts/validate_content.py content-v2/`
   reuses `worker/app/validator.py` and gates publishing. Exit codes: `0` ok
   (warnings allowed), `1` errors, `2` usage error.
2. **Worker (post-download)** — the worker re-validates the artifact it
   downloaded into `CONTENT_DIR_S3` on every cycle before seeding.

`validate_all(content_dir)` checks:

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

- **Error** → publish blocked (CI) / seed blocked (worker, `/status` shows
  `validation_failed`).
- **Warning** → proceeds. Current warnings: module ref without
  `module.yaml`, missing `lab.yaml` for a lab, environment ref that doesn't
  resolve, and skeleton labs (no `tasks`).

Current state: 0 errors, 16 skeleton warnings (git labs 2–10, docker labs 4–10).

---

## 5. Publishing to S3 (CI)

`.github/workflows/publish-content.yml` (`publish-content`):

- **Triggers**: push to `dev` touching `content-v2/**`; also
  `workflow_dispatch` (manual). Runs on the repo's **self-hosted** runner.
- **Secrets** (defined under the `dev` environment): `S3_BUCKET`,
  `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION`. The publish steps are gated on `S3_BUCKET` being set.
- **Steps**: checkout → setup-python 3.12 → `pip install pyyaml awscli` →
  `python scripts/validate_content.py content-v2/` (gate) →
  `python scripts/generate_manifest.py content-v2/ out/` →
  `aws s3 sync out/ s3://${S3_BUCKET}/`.

Artifact layout in the bucket:

```
latest.json                                     # {version, artifact_sha256, published_at}
published/{version}/content.tar.gz              # deterministic tar of content-v2/
published/{version}/manifest.json               # {version, files: [{path, sha256}]}
```

`scripts/generate_manifest.py`:

- `version` = content-derived sha256 (over sorted `"path sha256"` lines) —
  identical content → identical version → no re-download.
- Tarball is deterministic (mtime 0, uid/gid 0, mode 0644).
- `manifest.json` `files[]` drives the worker's per-file integrity check.

---

## 6. Seeding to Firestore (`worker/app/seeder.py`)

The worker is **S3-only** — it never reads a mounted `content-v2`. Every cycle:

1. **`download_content(s3_dir, db)`**
   - Fetches `latest.json` from the bucket.
   - Compares `version` with the `contentVersion` already seeded in Firestore
     (`_seeded_content_version`); if unchanged and `s3_dir/index.json`
     exists, it skips (already current).
   - Otherwise downloads `published/{version}/content.tar.gz`, verifies its
     sha256 against `latest.json` `artifact_sha256`, downloads
     `manifest.json` (must match the version), extracts to a temp dir,
     verifies every file against the manifest, then moves the verified
     contents into `s3_dir` (volume-mount-safe — moves children rather than
     renaming/rmtree'ing the mount point).
   - Returns the version, or `None` when S3 is unconfigured, unreachable, or
     nothing has been published yet. Integrity failures **raise** — a corrupt
     download never seeds silently.

2. **`validate_all(s3_dir)`** — see §4.

3. **`sync_courses(db, content_dir, content_version)`**
   - Reads `index.json`, then per course reads `course.yaml` → `module.yaml`
     → titles, and upserts a `courses` document.
   - **Full reconciliation**: every cycle rebuilds the derived document from
     source content and rewrites Firestore whenever the stored document
     differs from what would be produced now. `contentHash` (= sha256 over
     `course.yaml` + all `module.yaml` + all `lab.yaml`, chapter markdown
     excluded) is kept in the document for introspection but never gates a
     write by itself — so a stale derived field (e.g. a module seeded with
     empty chapters) can never persist.
   - **Document shape**: `{id, title, description, level, modules:[{
     id, title, description, order, items:[{type,id,title}],
     chapters:[{id,title,description,order}],
     labs:[{id,title,description,chapterId,order}] }], totalChapters,
     totalLabs, contentHash, contentVersion, updatedAt, createdAt}`.
     `slug` and `estimatedHours` are intentionally absent (see
     `docs/CLIENT-APP-PLAN.md` metadata contract).
   - **Orphan cleanup**: Firestore courses not in `index.json` are deleted.

Cadence: on startup, then every `SYNC_INTERVAL_SECONDS` (default 300s).
`GET /status` exposes `content_source` (`s3`), `published_version`, and the
last result; `POST /sync` forces a cycle. `GET /health` reports the S3
content dir.

---

## 7. Serving — backend content API (transitional)

> Transitional: today the backend serves content from the still-mounted
> `./content-v2` via `FilesystemProvider` (`CONTENT_SOURCE=filesystem`). In
> the target model the backend **stops serving file bytes** (see §9); no
> backend `S3Provider` will be built.

Resolving a course builds `items`/`chapters`/`labs` from `module.yaml` and
resolves titles (see §3); lab configs get `lab_id`/`module_id` injected and
`environment` replaced by the parsed `environments/{ref}.yaml`.

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
  `apt_packages`/`pre_pull`/`setup` from the resolved env (and `setup` from the
  lab YAML), and calls the orchestrator. The orchestrator runs each `setup`
  `{command}` as root inside the container (after the inner daemon is ready,
  before the student gets the terminal).
- `GET .../tasks` (authed) returns tasks; for dynamic multiple-choice it runs
  the validation `command` in the container and builds the option list.
- `POST .../validate` dispatches by `task.type`:
  `multiple_choice` (compare answer to `expected_answer`, or dynamic output —
  never executes state), `file_check` (`cat path` contains `contains`),
  `port_check` (exec command + match), default = run `command` and decide from
  `expected_exit_code` if present, else match output.
- `WS /ws/lab` proxies terminal frames to the orchestrator (JWT first message).

---

## 8. Frontend rendering (Next.js)

| Page | Data source | Renders |
|------|-------------|---------|
| `/dashboard` | `GET /content/courses` | catalog cards |
| `/courses/[courseId]` | `GET /content/courses/{id}` | curriculum accordion from module `items` |
| `/courses/[courseId]/chapters/[chapterId]` | `GET /content/chapters/{id}` | markdown via react-markdown |
| `/courses/[courseId]/labs/[labId]` | instructions + `GET .../tasks` | intro → provision → running |

Today these all fetch through the backend API (`next-app/lib/content-server.ts`
→ `BACKEND_URL`). In the target model (§9) the same data is served from the
locally extracted content directory.

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

## 9. Target: client-side app

The student downloads a **docker-compose** running `frontend` + `orchestrator`
on their own machine (Linux; requires the Docker CLI and sysbox). Cloud
components stay cloud-hosted.

Responsibilities:

| Side | Component | Role |
|------|-----------|------|
| Cloud | `backend` | Firestore API: auth, user history, progress, course catalog metadata; `GET /content/version` (current `contentVersion`, from Firestore) |
| Cloud | `worker` | S3 → validate → seed Firestore (unchanged from §6) |
| CI | validator | gate + publish artifact to S3 (unchanged from §5) |
| S3 | bucket | canonical content bytes, **public read** |
| Client | `frontend` | content bootstrap + serves course UI from local files |
| Client | `orchestrator` | runs lab containers on the student's docker (via local `docker.sock`) |

**Content bootstrap** (frontend, on startup):

1. `GET /content/version` from the backend → compare with the local version
   marker (e.g. a `version` file next to the extracted content).
2. If changed (or absent): download `published/{version}/content.tar.gz`
   directly from S3 (public read — no credentials), verify sha256 against
   `latest.json` `artifact_sha256`, extract into the local content dir,
   write the version marker.
3. Frontend serves TOC/chapters/instructions from that dir; the orchestrator
   spawns labs from the same `lab.yaml` files (it already receives
   `image`/`apt_packages`/`pre_pull` in the `start` request).

This mirrors the worker's `download_content()` logic; identical content →
identical version → no re-download.

**Distribution caveats**

- Local Floci (`http://localhost.floci.io:4566`) is dev-only. The target
  requires an internet-reachable S3-compatible bucket with **public read** for
  the artifact (course content is non-sensitive).
- The client must reach the backend API over the internet (Firestore-backed);
  the content bytes come from S3.
- sysbox + Docker CLI are the only host requirements today; install automation
  is future work.

---

## 10. Authoring workflow

1. Edit files under `content-v2/` (see §2 templates).
2. Run `python scripts/validate_content.py content-v2/` locally — fix errors,
   review warnings.
3. Commit + push to `dev` (path `content-v2/**`) → CI validates and publishes
   to S3 (§5).
4. The worker picks up the new version on its next cycle (or `POST /sync`) —
   check `/status` for `published_version` and `status: ok`.
5. Verify in the frontend: course page → chapter → lab.

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
- `deferred-improvements.md` — backlog (Item B, the old backend S3Provider
  plan, is superseded by §9)
