# LabOps — DevOps Learning Platform

A KodeKloud-style platform for learning Git and Docker through hands-on
interactive labs with real terminal environments.

## Architecture

```
HOST · docker compose
   frontend (:3000) ─────────────────────────────► backend (:8000)
      │                                              │
      │ GET /api/v1/content/version (handshake)      │ Firebase · Firestore
      │                                              │   (catalog/TOC, auth, progress,
      │ download → sha256 verify → extract ──────────┘    enrollments — written by backend/worker)
      │ → serve chapters/labs locally                 ▼
      ▼                                 host.docker.internal:8001
   S3 bucket (my-content-bucket)                      ▼
      ▲                                     VAGRANT VM · Ubuntu 22.04
      │ publish (CI / scripts)                  orchestrator (:8001 ⇐ guest :8000)
      │                                          Docker Engine + Sysbox
   content-v2/  (source of truth)                 sgp-lab-{ubuntu,docker,git}
      ▲                                          (lab containers · tmux terminal)
      │ download → verify
   worker (:8002) ── validate → seed ──► Firestore (metadata + contentVersion)
```

| Service | Port | Responsibility |
|---------|------|----------------|
| **frontend** `next-app/` | 3000 | Auth, learning wizard, xterm.js terminal, **content bootstrap** — downloads the published artifact from S3, verifies its sha256, extracts locally, and serves chapters/lab config from local files |
| **backend** `backend/` | 8000 | Pure metadata + data-location API: Firebase auth, catalog/TOC from Firestore, enrollment/progress, lab lifecycle proxy, version handshake. **Reads no content files** |
| **worker** `worker/` | 8002 | **S3-only**: downloads the artifact, verifies integrity, validates, seeds Firestore (polling + `POST /sync`) |
| **orchestrator** `orchestrator/` | 8001 | Docker container lifecycle, exec, WebSocket terminal — runs **inside the Vagrant VM** (guest `:8000` → host `:8001`) |

**Content delivery:** `content-v2/` is the source of truth, published to S3 by
CI/scripts. The worker seeds Firestore metadata; the frontend downloads the bytes
and serves them locally. The backend never touches course files.

## Highlights

- **Version handshake** — `GET /api/v1/content/version` → `{version, download_url, artifact_sha256}`
- **Client-driven labs** — the frontend supplies the env config and task specs in
  request bodies; validation runs server-side (exec in the container), so answers
  never reach the browser
- **Task validation** — answer-based (`multiple_choice`) vs state-based
  (`terminal_action`/`port_check`/`file_check`, exit-code preferred over output match)
- **Session recovery** — containers carry `com.sgp.*` labels; `start` re-attaches
  instead of duplicating after a restart
- **Guided in-chapter demos** — `:::terminal-demo` blocks → demo container + terminal

## Quick Start

| Step | See |
|------|-----|
| Environment + publish content + start the stack and VM | [`docs/setup.md`](docs/setup.md) |
| Hot reload, volume mounts, commands, pitfalls | [`docs/development.md`](docs/development.md) |
| Manual end-to-end test suite | [`docs/TESTING.md`](docs/TESTING.md) |
| Postman API suite | [`postman/README.md`](postman/README.md) |

The core sequence is: `docker compose up --build`, `vagrant up`, publish to
`my-content-bucket`, let the worker seed Firestore, then open
http://localhost:3000.

## Current Status

**Working** — client content bootstrap (handshake → download → sha256 verify →
local extract → serve); Firestore-seeded catalog/TOC; enrollment + progress
(chapters, labs, per-task `taskResults`); lab lifecycle proxy with client-
supplied config; server-side task validation; tmux WebSocket terminal (JWT first-
message handshake); label-based session recovery + restart-safe containers;
guided chapter demos; worker full-reconcile sync. Live content:
`d139fdc9a662520e`.

**Remaining / open**
- 16/20 labs are skeleton stubs (tasks for labs 4–10 of both courses)
- **Commit `scripts/generate_manifest.py`'s raw-tar hash fix + the cp-based
  workflow** — CI still produces checksum-mismatched artifacts until pushed
  (see `docs/bugs.md`)
- Course immutability enforcement (`structuralHash`) · webhook-triggered sync
  (Item D, designed) · content-integrity sync + new-content badges · group-
  membership false-negative bug · automated test harness
- Backlog: [`docs/deferred-improvements.md`](docs/deferred-improvements.md)

## Docs

- [`docs/PHASE-0.md`](docs/PHASE-0.md) — problem definition + frozen decisions (*read before new work*)
- [`docs/CONTENT-PIPELINE.md`](docs/CONTENT-PIPELINE.md) — content format, validation, publishing, seeding, immutability (§11)
- [`docs/CONTENT-AUTHORING.md`](docs/CONTENT-AUTHORING.md) — lab/chapter authoring guide
- [`docs/CLIENT-APP-PLAN.md`](docs/CLIENT-APP-PLAN.md) — historical client-side content delivery plan
- [`docs/architecture.xml`](docs/architecture.xml) — architecture diagram (draw.io XML)
- [`docs/bugs.md`](docs/bugs.md) — resolved root causes + open bug
- Service READMEs: [`backend/`](backend/README.md) · [`next-app/`](next-app/README.md) · [`orchestrator/`](orchestrator/README.md) · [`orchestrator/schemas/`](orchestrator/schemas/README.md)