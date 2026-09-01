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
   │  /api/v1/* (auth + catalog + progress)            /api/local-content/* (same-origin)
   ▼                                                       ▼
[next-app frontend] ──serves extracted content──► /app/.content  ◄──downloads+verifies──► [Floci S3]
   │
   │ /api/v1/content/version · /api/v1/courses · /api/v1/users/* · /api/v1/courses/*/progress
   │                          (backed by Firestore)
   ▼
[backend]  (metadata/progress only — no lab traffic)
   │
   │ REST /labs /demos + WS /ws/terminal (direct)
   ▼
[orchestrator] ──► Docker containers
   ▲
   │
[Firestore] ◄──seeds── [worker] ◄──downloads/validates── [Floci S3]
```

Key rule: **the backend reads no content files and never talks to the
orchestrator.** Course metadata lives in Firestore; content bytes live in the
client's local store; lab lifecycle/validation/terminal run frontend →
orchestrator directly.

---

## 3. Canonical flow (phase by phase)

### Phase 0 — Bootstrap (A1, A2)
1. `GET /api/v1/content/version` → `{version, download_url, artifact_sha256}`
   - Backend reads `contentVersion`/`artifact_sha256` from any Firestore course doc (worker-persisted) and returns a **presigned S3 URL** (`download_url`, 1-hour expiry) for `published/{version}/content.tar.gz`, signed with its AWS creds against the bucket's regional endpoint (the S3 bucket can stay private). No file I/O.
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

### Phase 4 — Lab lifecycle (A4, A5, A6) — orchestrator direct
> The backend proxy endpoints here (folders/lab requests in the backend
> collection) were **removed**. Lab lifecycle runs against the orchestrator
> (`http://localhost:8001`, `Authorization: Bearer $ORCHESTRATOR_SECRET`);
> `orchestrator/postman_collection.json` covers it.
1. `GET /labs/by_key?user_id=...&lab_id=lab-1` — recover a live session (by Docker labels).
2. `POST /labs` — body = `{user_id, lab_id, image, apt_packages, pre_pull, setup}` resolved client-side:
   ```json
   {"user_id":"student-1","lab_id":"lab-1","image":"labops-docker:latest","apt_packages":[],"pre_pull":["nginx:alpine","alpine:latest"],"setup":[]}
   ```
   → `{session_id, status, container_name, user_id, lab_id}`.
3. `GET /labs/{sessionId}` — container status.
4. Task *enrichment* no longer exists — the frontend reads task specs directly
   from its local content (`GET /api/local-content/labs/{courseId}/{labId}/tasks`).
5. `POST /labs/{sessionId}/exec` — body carries the task's validation command:
   ```json
   {"command":"<task.validation.command>","user":"student"}
   ```
   → `{exit_code, output}` — the frontend matches client-side
   (`expected_exit_code`, or `expected_output` with
   contains/exact/regex/line_count). `multiple_choice`/answer tasks are matched
   against `validation.expected_answer` in the client with no container call.
6. `POST /labs/{sessionId}/stop`, `POST /labs/{sessionId}/resume`,
   `DELETE /labs/{sessionId}` — lifecycle + teardown.
7. Terminal — browser opens `WS ws://<ORCHESTRATOR_URL>/ws/terminal` (no backend
   token endpoint); the shared secret is sent as the first message.

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
| A4 client-driven provisioning | ⚠️ removed from backend — `orchestrator/postman_collection.json` (`Start Lab`) |
| A5 client-driven validation | ⚠️ removed from backend — orchestrator collection (`Exec`) + client-side matching |
| A6 lab lifecycle | ⚠️ removed from backend — orchestrator collection (`Lab Lifecycle` folder) |
| A7 progress & completion | `3.2`, `5.1`, `5.2` |

---

## 5. Setup & run

1. **Prerequisites**: the stack is up
   (`docker compose -f docker-compose.local.yml --env-file environments/local/.env.local up --build -d`),
   content is published to Floci (`scripts/generate_manifest.py` → upload to
   `my-content-bucket`), and the worker has seeded Firestore
   (same command with `logs worker` → `Sync complete`).
2. **Import**: Postman → Import → `SGP_DockerMastery.postman_collection.json`.
   Optionally import the environment file and select **SGP DockerMastery Local**.
3. **Firebase auth (needed for folders 2–5)**: set `firebaseApiKey` (the web API
   key, from `NEXT_PUBLIC_FIREBASE_API_KEY`), plus `testEmail`/`testPassword` for a
   Firebase Auth user. Request `2.1` signs in and stores the ID token.
4. **Run**: Collection Runner → select the collection → run. Folders execute in
   order and pass `version`, `sessionId`, `labConfigRaw`, etc. between requests.
5. **Expected result**: ~30 requests, all green. Folders 0–1 pass without Firebase
   config; 2+ return 401 until credentials are set. **Folders 4–5 (labs) are
   STALE — the backend proxy endpoints 404 now; run lab lifecycle/validation
   against `orchestrator/postman_collection.json` (orchestrator direct) instead.**

> ⚠️ **Warning**: provisioning requests in
> `orchestrator/postman_collection.json` create a **real Docker container** on the
> host (via the orchestrator's docker.sock); a stale container can be cleaned up with:
> `docker ps --filter label=labops-lab --format '{{.ID}}' | xargs -r docker rm -f`

---

## 6. Notes / known gaps

- The sha256 probe in `0.1` asserts the `download_url` is reachable and logs the
  hash comparison; exact binary hashing in the Postman sandbox is unreliable, so
  authoritative integrity verification remains the frontend's `ensureContent()`.
- `port_check` and `file_check` task types are exercised by the orchestrator
  `exec` contract but not present in `lab-1`; they can be tested with a synthetic
  validation spec via `POST /labs/{sessionId}/exec`.
