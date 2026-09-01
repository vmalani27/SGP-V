# Content Pipeline (`content-v2/`)

End-to-end reference for the course content system: how `content-v2/` is
structured, validated, published to S3, seeded into Firestore, and consumed by
the worker (metadata) and the frontend (client-side content bootstrap).

## Current vs target

| Component | Now | Next |
|-----------|-----|------|
| Validator | `scripts/validate_content.py` (CI gate) + worker re-validation | unchanged |
| Publisher | CI → S3 (`latest.json` + `published/{version}/…`) | unchanged |
| S3 bucket | Floci (dev, host loopback) | public-read S3-compatible bucket |
| Worker | S3-only: download → validate → seed Firestore | webhook-triggered sync (Item D) |
| Backend | pure Firestore API (auth/catalog/progress) + `GET /api/v1/content/version` — reads **no** content files | unchanged |
| Frontend | boots content from S3 (handshake → download → sha256 verify → extract) and serves chapters/labs locally | packaged client |
| Orchestrator | runs inside the Vagrant VM (dev: Ubuntu + Docker + Sysbox; guest :8000 → host :8001), lab container lifecycle + exec + terminal WS — the frontend calls it **directly** | packaged client runs it on the student's docker |

---

## Data flow

### Now

```
content-v2/  (canonical format, source of truth for authoring)
    │
    ├──→  CI  (.github/workflows/publish-content.yml, self-hosted runner)
    │         validate_content.py  →  generate_manifest.py  →  upload published/ + latest.json
    │         ──►  S3 bucket: latest.json + published/{version}/{content.tar.gz, manifest.json}
    │
    │   [webhook, proposed]  CI then POSTs /sync — the worker seeds immediately
    │   instead of waiting for its next poll (see §6 "Triggered sync (webhook)")
    │
S3 bucket ──→  Worker  (S3-only; no filesystem mount)
    │            1. download_content()   — fetch latest.json, compare contentVersion,
    │               download tarball, verify artifact_sha256 + per-file hashes,
    │               extract into CONTENT_DIR_S3 (/data/content)
    │            2. validate_all()       — schema checks on the downloaded artifact
    │            3. sync_courses()       — idempotent upsert to Firestore `courses`
    │               (writes contentHash + contentVersion)
    │   triggers:  POST /sync (webhook — push) or the 300s poll (pull safety net)
    │
S3 bucket ──→  Frontend  (Next.js, same-origin bootstrap)
    │            GET /api/v1/content/version → compare local marker → download
    │            tarball → verify sha256 → extract to /app/.content → serve locally
    │            (/api/local-content/* — no backend content reads)
    │
    ├──→  Backend  (metadata API — reads no content files, never calls the orchestrator)
    │         GET /api/v1/content/version — handshake (contentVersion from Firestore)
    │         GET /api/v1/courses*        — catalog + TOC from Firestore `courses`
    │         (no lab / demo / terminal traffic)
    │
    └──→  Frontend ──→  Orchestrator  (direct; the VM sees only commands)
              POST /labs {image,…} · /labs/{id}/exec · WS /ws/terminal — never reads course files
```

### Target distribution (packaged client)

The client-side content model above is what dev already implements (§7–8);
what remains is shipping the frontend + orchestrator as a student-machine
package instead of the dev Vagrant VM.

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

#### `:::terminal-demo` — inline guided demos

A chapter slide can embed a live, disposable terminal via a fenced directive.
The body is YAML:

```yaml
:::terminal-demo
id: container-lifecycle          # REQUIRED — labels the demo container
image: labops-docker:latest
pre_pull:
  - alpine:latest
state:                            # optional live state chip in the header
  label: demo container
  command: docker inspect -f '{{.State.Status}}' demo 2>/dev/null || echo "not created"
steps:                            # ordered, guided click-to-insert commands
  - id: create-demo
    label: Create and start the container
    run: docker run -d --name demo alpine:latest sleep 300
    expect: |
      A long container ID is printed; the state chip flips to `running`.
:::
```

- `steps[]` — ordered guided commands. `run` is inserted into the terminal for
  the learner to run; `label` names the step; `expect` is a "what you should
  see" note (collapsible before, auto-shown after the step is done). Steps
  auto-advance when the command is submitted (Enter).
- `examples[]` — optional free-form commands for exploration (rendered as
  chips below the stepper).
- `state` — optional poll; `command` is `exec`'d every few seconds and its
  output drives the state chip in the terminal header.

**Container sharing (memory):** each distinct `id` maps to exactly **one**
persistent demo container per learner, label-addressed and reused across all
slides of the chapter (the orchestrator re-attaches on re-ensure; the terminal
tmux session and scrollback survive slide navigation). Inline demos on
different slides should therefore reuse the **same** `id` so the whole chapter
costs a single container — a new `id` spawns a new container, so only mint a
new one for a genuinely different environment. The validator warns when a
chapter declares more than two distinct demo ids. Containers are destroyed
when the learner leaves the chapter, and the orchestrator TTL sweeper reclaims
abandoned ones.

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
base_image: "labops-docker:latest"
pre_pull:
  - nginx:alpine
  - alpine:latest
```

```yaml
# linux-basic.yaml
base_image: labops-ubuntu:latest
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
  `python scripts/generate_manifest.py content-v2/ out/` → upload
  `out/published/` → upload `out/latest.json` **last** (it is the pointer
  clients act on; `cp`, not `sync` — identical content re-uploads so a rebuilt
  artifact under an unchanged version is never skipped). When the webhook
  trigger lands (§6), a final step calls the worker `POST /sync`.

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
- `artifact_sha256` = sha256 of the **raw (uncompressed) tar bytes** — never
  the gzip stream. This is the one convention the whole chain agrees on
  (generator, worker `seeder.py`, frontend bootstrap); a publisher that hashes
  the compressed bytes instead hard-fails the worker's checksum guard (see
  `docs/bugs.md` "artifact_sha256 convention mismatch").
- `manifest.json` `files[]` drives the worker's per-file integrity check.

---

## 6. Seeding to Firestore (`worker/app/seeder.py`)

The worker is **S3-only** — it never reads a mounted `content-v2`. Every cycle:

1. **`download_content(s3_dir, db)`**
   - Fetches `latest.json` from the bucket.
   - Compares `version` with the `contentVersion` already seeded in Firestore
     (`_seeded_content_version`); if unchanged and `s3_dir/index.json`
     exists, it skips (already current).
   - Otherwise downloads `published/{version}/content.tar.gz`, verifies the
     sha256 of its decompressed bytes against `latest.json` `artifact_sha256`
     (the raw tar is byte-deterministic; the gzip stream is not), downloads
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

### Triggered sync (webhook)

Publishing is **push** (CI → S3), but seeding was **pull** (worker poll), so a
published version could take up to `SYNC_INTERVAL_SECONDS` to reach Firestore.
The webhook pattern removes that window: after the S3 upload, CI calls
`POST /sync` and the worker validates + seeds **immediately**; the poll stays
only as a reconciliation safety net.

Why this is webhook logic, not "the worker in CI":

- **The worker is a runtime consumer, not a pipeline stage.** It holds Firestore
  write credentials (`GOOGLE_APPLICATION_CREDENTIALS`); CI holds only S3
  credentials. Triggering the runtime service rather than seeding from CI keeps
  those trust domains separate.
- **Idempotent and convergent.** `download_content()` already short-circuits
  when the version is seeded *and* still verified; `sync_courses()` is a full
  reconcile. Re-triggering `POST /sync` (re-run workflows, parallel pushes, a
  second publish under the same version) is always a no-op or a correct
  rewrite — there is no "seed state" to corrupt.
- **The checksum guard stays.** A webhook is just a nudge; the worker still
  downloads, verifies `artifact_sha256` + the per-file manifest, and refuses to
  seed a mismatched artifact. Event-driven freshness must not weaken integrity.

Requirements before this lands (tracked in `docs/deferred-improvements.md`
Item D):
1. A "Trigger worker sync" CI step that hits `POST /sync` after `latest.json`.
2. Auth for `POST /sync` (shared-secret header) before the worker is reachable
   outside dev.
3. Optionally raise `SYNC_INTERVAL_SECONDS` once the webhook is the primary
   trigger — the poll then exists purely to self-heal.

---

## 7. Serving — client-side content delivery (current)

The backend serves **no file bytes**. Course metadata lives in Firestore
(seeded by the worker); the content bytes live in S3 and, once downloaded, in
the frontend's local content dir (`/app/.content`).

| Endpoint | Owner | Returns |
|----------|-------|---------|
| `GET /api/v1/content/version` | backend | `{version, download_url, artifact_sha256, from_version, changes, updatedAt}` — handshake, from Firestore + `CONTENT_PUBLIC_BASE_URL` |
| `GET /api/v1/courses` · `GET /api/v1/courses/{id}` | backend | catalog + TOC from Firestore `courses` |
| `/api/local-content/chapters/{courseId}/{chapterId}` | frontend | chapter markdown from the local store |
| `/api/local-content/labs/{courseId}/{labId}/instructions` | frontend | lab instructions from the local store |
| `/api/local-content/labs/{courseId}/{labId}/config` | frontend | lab YAML config, environment resolved |
| `/api/local-content/labs/{courseId}/{labId}/tasks` | frontend | lab tasks from the local store |
| `POST /labs` · `/labs/{id}/exec` · `WS /ws/terminal` | **orchestrator** | lab lifecycle + validation exec + terminal — the frontend talks to it **directly** (`next-app/lib/api.ts` `orchestratorFetch`), the backend is not in the path |

**Lab runtime (frontend → orchestrator, direct)** — no backend involvement:

- Provisioning sends the **client-supplied** env config `{image, apt_packages, pre_pull, setup}` to the orchestrator's `POST /labs` — the orchestrator never reads `lab.yaml`. Re-entry uses `GET /labs/by_key` (labels) and re-applies `setup` on reuse so a stale container never stays broken.
- Tasks come from the frontend's own local store (`/api/local-content/labs/{id}/tasks`); nothing calls the backend for them.
- Validation: the frontend dispatches by `task_type` (`multiple_choice`, `file_check`, `port_check`, default = command + match), runs the `validation.command` via orchestrator `POST /labs/{sessionId}/exec`, and matches `/expected_exit_code` client-side.
- Terminal: `WS /ws/terminal` from the browser directly to the orchestrator (first-message token handshake).
- Decoupling note: the backend ships **no** lab/demo routers — `labs.py`/`demos.py`
  (and `/api/v1/labs*`, `/api/v1/demos*`, `WS /api/v1/labs/ws/lab`) were removed.
  It serves metadata + progress + the version handshake only.

---

## 8. Frontend rendering (Next.js)

| Page | Data source | Renders |
|------|-------------|---------|
| `/dashboard` | `GET /content/courses` | catalog cards |
| `/courses/[courseId]` | `GET /content/courses/{id}` | curriculum accordion from module `items` |
| `/courses/[courseId]/chapters/[chapterId]` | `GET /content/chapters/{id}` | markdown via react-markdown |
| `/courses/[courseId]/labs/[labId]` | instructions + `GET .../tasks` | intro → provision → running |

Catalog/TOC come from the backend's Firestore API (`next-app/lib/content-server.ts`
→ `BACKEND_URL`); chapter/lab content comes from the locally extracted content
directory (`/api/local-content/*`, backed by `next-app/lib/content-local.ts`).

**Lab page phases**: `loading → intro → provisioning → running → error`.

- **intro** — title, a difficulty meter placeholder (time/XP/beginner text are
  intentionally not shown), objectives, instructions, Start Lab.
- **running** — toolbar (pause/resume/restart/destroy) + task renderer +
  terminal (xterm.js over the orchestrator WebSocket — direct).

**Task renderer** (`LabTaskRenderer`) dispatches on `task.type`:
`multiple_choice` → `MultipleChoiceTask`, `terminal_action` →
`TerminalActionTask`, `port_check` → `PortCheckTask`. Each validates via the
orchestrator's `exec` (see §7); correct → success animation + advance,
incorrect → `error_message` + `hint`. All tasks done → Submit Lab modal
records completion (backend) and destroys the container (orchestrator).

---

## 9. Target: packaged client distribution

> Dev already runs the client-side model (§7): the frontend bootstraps content
> from S3 and the orchestrator is hosted in a Vagrant VM on dev. §9 is the
> long-term **distribution** target — shipping the same stack to the student's
> own machine.

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

As in dev (§7), the client's `frontend` calls the client's `orchestrator`
directly (`localhost:8001` REST + `ws://localhost:8001/ws/terminal`) — the
cloud `backend` stays out of the lab path entirely.

**Content bootstrap** (frontend, on startup):

1. `GET /content/version` from the backend → compare with the local version
   marker (e.g. a `version` file next to the extracted content).
2. If changed (or absent): download `published/{version}/content.tar.gz`
   directly from S3 (public read — no credentials), verify sha256 of the
   decompressed bytes against `latest.json` `artifact_sha256`, extract into
   the local content dir, write the version marker.
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
   to S3 (§5) and, once the webhook is wired (§6), pushes the worker to seed
   all the way to Firestore.
4. Until the webhook lands, the worker picks the new version up on its next
   poll (or `POST /sync`) — check `/status` for `published_version` and
   `status: ok`.
5. Verify in the frontend: course page → chapter → lab.

**Course immutability**: once users are enrolled, structure is append-only —
see §11.

---

## 11. Course immutability (on enrollment)

Progress is stored as `{moduleId: {chapterId: "completed"}}` (chapters) and
`{moduleId: {labId: "completed"}}` (labs); "100% complete" is computed by
comparing the enrollment's completed items against `totalChapters`/`totalLabs`
from the Firestore `courses` document (seeded by the worker). Structural edits
after enrollment orphan progress entries or skew percentages.

**Once a course has enrolled users, it is structurally immutable — changes are
append-only.**

| Change | Allowed? | Effect on existing enrollments |
|--------|----------|-------------------------------|
| Fix typo in chapter markdown / lab YAML / course metadata | Yes | None — content/messages only |
| Append a module / chapter / lab | Yes | `totalChapters`/`totalLabs` grows; existing percentages shift slightly (acceptable) |
| Reorder modules/chapters/labs | No | Invalidates progress-map order references |
| Delete a module/chapter/lab | No | Orphaned progress entries, wrong percentage |
| Rename a module/chapter/lab ID | No | Progress keys no longer match — effectively deletes that progress |
| Move an item between parents | No | Progress references the wrong parent |

**Pre-launch** (no real users): relaxed — keep stable IDs by convention; the
worker re-seeds (sync is idempotent, so wiping Firestore is enough).

**Post-launch enforcement** (not implemented, tracked under the backlog): a
worker `--check-structure` mode plus a `structuralHash` over item IDs/ordering —
the worker rejects destructive diffs instead of seeding them, and the backend
refuses to serve a course whose structural hash doesn't match Firestore.

---

## Related docs

- `README.md` — architecture overview, service table, quick links
- `docs/setup.md` — environment setup + local publish, start, and verify steps
- `docs/development.md` — hot reload, volume mounts, useful commands
- `backend/README.md` — backend (metadata API) config + endpoints
- `next-app/README.md` — frontend structure, content bootstrap, validation flow
- `orchestrator/README.md` + `orchestrator/schemas/README.md` — orchestrator
  API + lab authoring guide / JSON Schema
- `postman/README.md` — end-to-end Postman suite for the content-delivery flow
- `deferred-improvements.md` — backlog (Items B/C/D context)
