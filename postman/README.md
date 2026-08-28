# SGP — Docker Mastery Content Delivery: API Flow & Postman Suite

This document defines the **canonical end-to-end API flow** for the content-delivery
user story, scoped to the **Docker Mastery** course (`courseId=docker-mastery`,
module `docker-fundamentals`, `lab-1`), and maps every aspect of the problem to the
endpoints and to the Postman requests that verify them.

Files:

| File | Purpose |
| --- | --- |
| `SGP_DockerMastery.postman_collection.json` | The test suite (import this) |
| `SGP_DockerMastery_Environment.postman_environment.json` | Local env variables (optional import) |
| `README.md` | This flow definition |

---

## 1. The problem (user story aspects)

| # | Aspect | What must be true |
| --- | --- | --- |
| A1 | **Version handshake / content integrity** | The client learns the published content version, where to download it, and the sha256 to verify — without the backend reading any files. |
| A2 | **Client-side content delivery** | The backend serves **no** course files (no `content-v2` mount, no `FilesystemProvider`). The frontend downloads the tarball, verifies sha256, extracts it locally, and serves chapters/lab instructions/config from there. |
| A3 | **Catalog + TOC from Firestore** | Course catalog and structure come from Firestore (seeded by the worker), not from course.yaml on a mount. |
| A4 | **Client-driven lab provisioning** | The client supplies `{image, apt_packages, pre_pull, setup}` in the start request body (from its local resolved config). |
| A5 | **Client-driven task validation** | The client supplies the task list and each task's `task_type` + `validation` spec in the request bodies. |
| A6 | **Lab lifecycle** | start → tasks → validate → status → stop/resume → token → destroy, proxied backend → orchestrator. |
| A7 | **Progress & completion** | Chapter + lab completion persisted to Firestore. |

---

## 2. Architecture

```
 Browser
   │  /api/v1/* (auth + catalog + labs + progress)      /api/local-content/* (same-origin)
   ▼                                                       ▼
[next-app frontend] ──serves extracted content──► /app/.content  ◄──downloads+verifies──► [Floci S3]
   │
   │ /api/v1/content/version · /api/v1/courses · /api/v1/labs/* · /api/v1/users/* · /api/v1/courses/*/progress
   ▼
[backend] ──proxies labs──► [orchestrator] ──► Docker containers
   ▲
   │
[Firestore] ◄──seeds── [worker] ◄──downloads/validates── [Floci S3]
```

Key rule: **the backend reads no content files.** Content metadata lives in
Firestore; content bytes live in the client's local store; lab behaviour specs
flow client → backend → orchestrator.

---

## 3. Canonical flow (phase by phase)

### Phase 0 — Bootstrap (A1, A2)
1. `GET /api/v1/content/version` → `{version, download_url, artifact_sha256}`
   - Backend reads `contentVersion`/`artifact_sha256` from any Firestore course doc (worker-persisted) and derives `download_url = {CONTENT_PUBLIC_BASE_URL}/published/{version}/content.tar.gz`. No file I/O.
2. Frontend compares against its local version marker; on change it downloads
   the tarball, verifies `sha256(gunzip(tarball)).slice(0,16) === artifact_sha256`
   (raw tar bytes — the gzip stream is not byte-stable across zlib versions),
   extracts into `/app/.content/data`.
3. Content is then served locally:
   - `GET /api/local-content/chapters/{courseId}/{chapterId}` → `{content: markdown}`
   - `GET /api/local-content/labs/{courseId}/{labId}/instructions` → `{lab_id, title, module_id, chapter_id, instructions}`
   - `GET /api/local-content/labs/{courseId}/{labId}/config` → parsed lab.yaml with `environment` resolved to `{base_image, apt_packages|pre_pull, ...}`
   - `GET /api/local-content/labs/{courseId}/{labId}/tasks` → `{lab_id, tasks}`

### Phase 1 — Catalog & TOC (A3)
- `GET /api/v1/courses` → catalog array
- `GET /api/v1/courses/docker-mastery` → TOC with `modules[].items` (linear path), `chapters`, `labs`, plus `contentVersion`/`artifact_sha256`.

### Phase 2 — Auth & enrollment (prerequisite)
- Sign in with Firebase → ID token (`Authorization: Bearer <idToken>`)
- `POST /api/v1/users/sync`
- `POST /api/v1/courses/docker-mastery/enroll`
- `GET /api/v1/courses/docker-mastery/progress`

### Phase 3 — Chapter learning (A2, A7)
- `GET /api/local-content/chapters/docker-mastery/chapter-1` (local markdown)
- `PUT /api/v1/courses/docker-mastery/progress` `{moduleId, chapterId, status}` → mark complete.

### Phase 4 — Lab lifecycle (A4, A5, A6)
1. `GET .../labs/lab-1/active` — read-through session check (orchestrator by labels).
2. `POST .../labs/lab-1/start` — body = env config resolved client-side:
   ```json
   {"image":"sgp-lab-docker:latest","apt_packages":[],"pre_pull":["nginx:alpine","alpine:latest"],"setup":[]}
   ```
   → `{session_id, lab_id, container_name, status, ws_token, ws_url}`.
3. `GET .../labs/lab-1/status/{sessionId}` — container status.
4. `POST .../labs/lab-1/tasks` — body = client's local task list `{tasks:[...]}`; backend returns it (enriching dynamic multiple-choice options via in-container commands).
5. `POST .../labs/lab-1/validate` — body carries the task's spec:
   ```json
   {"task_id":"access-daemon","answer":"No","task_type":"multiple_choice","validation":{"expected_answer":"No"},"error_message":"...","hint":"..."}
   ```
   → `{correct, output?, error?, hint?}`. The backend runs `validation.command` in the container (terminal_action/file_check/port_check) or compares the answer (multiple_choice) — always against the **client-supplied** spec.
6. `POST .../stop/{sessionId}`, `POST .../resume/{sessionId}`, `POST .../token/{sessionId}`, `DELETE .../{sessionId}` — lifecycle + teardown.

### Phase 5 — Completion (A7)
- `PUT /api/v1/courses/docker-mastery/labs/lab-1/progress` `{moduleId, status}` → mark lab complete.
- `GET /api/v1/courses/docker-mastery/progress` → final state.

---

## 4. Aspect → Postman request map

| Aspect | Requests |
| --- | --- |
| A1 version handshake / integrity | `0.1` |
| A2 client-side content delivery | `0.2`–`0.5`, `3.1`; regression: `0.6` (backend must 404) |
| A3 Firestore catalog / TOC | `1.1`, `1.2` |
| A4 client-driven provisioning | `4.2` (config-built body), negative `4.12` (missing image → 422) |
| A5 client-driven validation | `4.4` (client task list), `4.5`–`4.8` (client validation specs) |
| A6 lab lifecycle | `4.1`–`4.14` |
| A7 progress & completion | `3.2`, `5.1`, `5.2` |

---

## 5. Setup & run

1. **Prerequisites**: the stack is up (`docker compose up --build`), content is
   published to Floci (`scripts/generate_manifest.py` → upload to `course-content`),
   and the worker has seeded Firestore (`docker compose logs worker` → `Sync complete`).
2. **Import**: Postman → Import → `SGP_DockerMastery.postman_collection.json`.
   Optionally import the environment file and select **SGP DockerMastery Local**.
3. **Firebase auth (needed for folders 2–5)**: set `firebaseApiKey` (the web API
   key, from `NEXT_PUBLIC_FIREBASE_API_KEY`), plus `testEmail`/`testPassword` for a
   Firebase Auth user. Request `2.1` signs in and stores the ID token.
4. **Run**: Collection Runner → select the collection → run. Folders execute in
   order and pass `version`, `sessionId`, `labConfigRaw`, etc. between requests.
5. **Expected result**: ~30 requests, all green. Folders 0–1 pass without Firebase
   config; 2+ return 401 until credentials are set.

> ⚠️ **Warning**: request `4.2` provisions a **real Docker container** on the host
> (via the orchestrator's docker.sock) and `4.13` destroys it. If a run fails
> mid-way, clean up with:
> `docker ps --filter label=sgp-lab --format '{{.ID}}' | xargs -r docker rm -f`
> or rerun `4.1` → `4.13` (active shows the leftover session id).

---

## 6. Notes / known gaps

- The sha256 probe in `0.1` asserts the `download_url` is reachable and logs the
  hash comparison; exact binary hashing in the Postman sandbox is unreliable, so
  authoritative integrity verification remains the frontend's `ensureContent()`.
- `4.8` (fix-group) asserts the response contract, not `correct=true` — on a fresh
  container the student hasn't completed the task, so the real outcome is `false`.
- `port_check` and `file_check` task types are supported by the backend contract but
  not present in `lab-1`; they can be exercised with a synthetic validation spec in
  `4.5` the same way the exec probe is.
