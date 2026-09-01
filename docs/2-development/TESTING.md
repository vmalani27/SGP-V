# Manual Testing Guide — SGP_V

Covers the **prerequisites, user stories, success criteria, and manual test steps**
for the fixes and changes landed so far on `dev`. This is the companion to
`README.md` and `postman/README.md`.

> Tip: run the tests in order. Tests 1–4 verify the worker + backend plumbing that
> everything else depends on; tests 5–6 verify the product-facing behaviour.

---

## 0. Prerequisites

| # | Requirement | Notes |
|---|-------------|-------|
| 1 | Linux host with **Docker Engine + Sysbox** (`sysbox-runc`) | Lab containers need a safe runtime; see `orchestrator/README.md` |
| 2 | **Docker Compose v2** | `docker compose` (not `docker-compose`) |
| 3 | A **Firebase project** with Auth + Firestore enabled | Need the service account JSON + web API key |
| 4 | An **S3-compatible store** at `http://localhost.floci.io:4566` with a `my-content-bucket` bucket | Floci for dev; or point the worker at any S3 endpoint via env vars |
| 5 | `aws` CLI + `python3` + `pyyaml` | For publishing content and inspecting the store |
| 6 | **Published content artifact** in the bucket | See Baseline below |

### Baseline setup

```bash
# 0. Local env file — copy environments/local/.env.local.sample →
#    environments/local/.env.local and fill the Firebase vars (docs/setup.md §3a).
#    Short-hand for the local stack (floci S3, no AWS creds needed):
C="docker compose -f docker-compose.local.yml --env-file environments/local/.env.local"

# 1. Validate + publish content to the S3 store (CI does this on push to dev)
python scripts/validate_content.py content-v2/          # expect: exit 0
python scripts/generate_manifest.py content-v2/ out/
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1
aws --endpoint-url http://localhost.floci.io:4566 s3 mb s3://my-content-bucket   # if it doesn't already exist
aws --endpoint-url http://localhost.floci.io:4566 s3 sync out/ s3://my-content-bucket/

# 2. Start the stack (local host compose + orchestrator VM)
$C up --build -d
vagrant up                      # provisions + starts the orchestrator VM (Docker + Sysbox)

# 3. Lab images are built inside the VM by provisioning/build-lab-images.sh
#    (the VM's own Docker runs the lab containers; ~1 rebuild after first vagrant up)
```

**Health baseline** — everything green before testing:
```bash
curl http://localhost:8000/health                    # {"status":"ok"}
curl http://localhost:8000/api/v1/content/version    # {version, download_url, artifact_sha256}
curl http://localhost:8002/status                    # content_source: "s3", published_version set
$C logs worker                                       # "Sync complete: 2 synced, 0 skipped, 0 errors"
```

---

## Test 1 — Worker boots and syncs without crashing

**Commit:** `376cdaa` (fix(worker): unpack 2-tuple from download_content in
`_active_content_dir`), also guarded by `f2c0a7d`.

**Bug:** `download_content()` returns `(version, artifact_sha256)` but
`_active_content_dir()` tried to unpack three values → every sync cycle raised,
so the worker never seeded Firestore (crash loop / empty catalog).

**User story:** *As an operator, I want the worker to download the published
content and seed Firestore on startup, so the app shows the course catalog.*

**Success criteria**
- [ ] Worker container is up (no crash loop, no traceback in `docker compose -f docker-compose.local.yml --env-file environments/local/.env.local logs worker`)
- [ ] `GET /status` → `content_source: "s3"`, `published_version` equals the
      `version` in `out/latest.json`
- [ ] `GET /status` → `last_result.status: "ok"` with `synced: 2`
- [ ] Firestore `courses` has `git-fundamentals` and `docker-mastery` docs each
      carrying `contentVersion` + `artifact_sha256`

**Manual test**
```bash
# C = "docker compose -f docker-compose.local.yml --env-file environments/local/.env.local"  (see top)
$C logs -f worker                # wait for "Sync complete: 2 synced, 0 skipped"
curl http://localhost:8002/status
cat out/latest.json              # compare version
# Firestore console → courses collection → both docs exist
```

---

## Test 2 — Full-reconcile Firestore sync (correct derived metadata)

**Commit:** `8d950b8` (fix: full-reconcile Firestore course sync with derived metadata).

**Bug:** the seeder only rewrote Firestore when `contentHash` changed, and docs
created before the metadata fields existed stayed stale — empty `modules[].chapters/
labs/items`, `totalChapters: 0`, `totalLabs: 0`, leftover `slug`/`estimatedHours`.

**User story:** *As a learner, I want the curriculum (modules → chapters/labs with
titles, orders, and counts) to be complete and correct wherever I look in the app.*

**Success criteria**
- [ ] Firestore course docs have **populated** `modules[]` with real
      `id/title/description/order`, plus `items[]`, `chapters[]`, `labs[]`
- [ ] `totalChapters` and `totalLabs` are correct and > 0 (docker-mastery → `totalLabs: 10`)
- [ ] No `slug` or `estimatedHours` field remains on the docs
- [ ] **Idempotency:** a second sync is a no-op → `/status` shows `skipped: 2`
- [ ] **Self-healing:** deleting a course doc in Firestore then forcing a sync
      recreates it fully populated

**Manual test**
```bash
# Inspect one course doc (Firestore console):
#   courses/docker-mastery → totalLabs should be 10, modules[].labs populated

# Idempotency
scripts\local\deploy_floci_lambda.bat
docker logs floci                  # last_result.skipped == 2

# Self-healing: delete courses/docker-mastery in the Firestore console, then:
scripts\local\deploy_floci_lambda.bat
docker logs floci                  # last_result.synced == 1 (recreated)

# Frontend: http://localhost:3000/courses/docker-mastery
#   → module accordions list chapters + labs with titles; counts match Firestore
```

---

## Test 3 — Content updates land in the writable volume + version persists

**Commit:** `f2c0a7d` (fix: swap S3 content into volume mount point and persist
`contentVersion` on skip).

**Bug:** the extraction target is a **volume mount point** (`/data/content`), where
`rmtree`/`rename` can fail or corrupt the tree; and when content was already
current, the skip path didn't persist `contentVersion`, so the backend's
version handshake had nothing to read.

**User story:** *As an operator, I want a content update to arrive in the worker's
volume cleanly and to update Firestore's `contentVersion`, so clients learn about
the new version.*

**Success criteria**
- [ ] After republishing changed content, worker logs `Downloaded content version <v2>`
- [ ] `GET /status` → `published_version` is the **new** version
- [ ] `/data/content/index.json` exists inside the worker container (tree intact, mount not corrupted)
- [ ] Firestore docs now carry the new `contentVersion` + matching `artifact_sha256`

**Manual test**
```bash
# Make a real change (e.g. add a sentence to a chapter md), then republish:
python scripts/validate_content.py content-v2/
python scripts/generate_manifest.py content-v2/ out/
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1
aws --endpoint-url http://localhost.floci.io:4566 s3 cp out/published/ s3://my-content-bucket/published/ --recursive
aws --endpoint-url http://localhost.floci.io:4566 s3 cp out/latest.json s3://my-content-bucket/latest.json

# Force a cycle and observe the new version
scripts\local\deploy_floci_lambda.bat
docker logs floci                    # published_version changed
$C exec worker ls /data/content                     # index.json present
# Firestore console → course doc contentVersion == new version
```

---

## Test 4 — Validation gating + seed correctness (Deferred Item A)

**Branches/fixes:** `fix/worker-validation-seeding` (see `docs/deferred-improvements.md` Item A).

**Bugs (4-in-1):**
1. Task validation wrongly required `command` for *every* type, so
   `file_check`/`port_check`/`multiple_choice` false-failed.
2. Non-fatal issues (missing module/lab YAML, unresolvable env, skeleton labs)
   were **errors** that blocked seeding instead of warnings.
3. Seeder wrote wrong metadata: 0-based orders, missing `description`/`chapterId`,
   unresolved titles.
4. A validation failure **raised**, crashing the whole sync cycle and blocking all
   Firestore updates.

**User story:** *As an operator, I want valid content to seed cleanly and invalid
content to report a failure state without taking the worker down.*

**Success criteria**
- [ ] `python scripts/validate_content.py content-v2/` → **exit 0**, 0 errors,
      16 skeleton-lab warnings (prints as `WARN`)
- [ ] Seeded docs use **1-based** `order`, real `description`/`chapterId`, resolved lab titles
- [ ] Invalid content → `GET /status` shows `last_result.status: "validation_failed"`
      and the worker **keeps running** (next cycle still executes)
- [ ] After fixing + republishing, `POST /sync` → back to `status: "ok"`

**Manual test**
```bash
# 1. Local gate
python scripts/validate_content.py content-v2/; echo "exit=$?"
#    → exit=0, ~16 WARN skeleton lines, no ERROR

# 2. Induce a validation failure: corrupt one lab.yaml (e.g. remove the
#    environment field), republish, force sync:
scripts\local\deploy_floci_lambda.bat
docker logs floci                    # last_result.status == "validation_failed"
$C logs worker                                         # worker still alive, logs validation error

# 3. Restore the file, republish, force sync again:
curl -X POST http://localhost:8002/sync              # status back to "ok"
```

---

## Test 5 — Answer-based vs state-based task validation

**Commit:** `b2e99fa` (feat: answer-based vs state-based lab task validation with
exit codes and setup commands).

**Bug:** answer tasks (e.g. "Can you reach the Docker daemon?" → `No`) were being
re-validated against *container state*, so once the student completed a later task
(added the docker group) the earlier answer **flipped** to wrong.

**User story:** *As a learner, I want an answer I already gave to stay correct even
after later tasks change the container, and a state check to pass only when the
state actually holds.*

**Success criteria**
- [ ] `multiple_choice` with `expected_answer` validates **without executing** anything
- [ ] `terminal_action` with `expected_exit_code` passes/fails on **exit code only**
- [ ] Re-validating `access-daemon` after completing `fix-group` still returns `correct: true`
- [ ] `count-images` is `correct` only when the image count is exactly 2
- [ ] `run-simple-container` is `correct` only when the named container exists,
      runs `alpine:latest`, and logged the greeting

**Manual test (UI)**
1. http://localhost:3000 → login → Docker Mastery → `lab-1: Hello World Container` → Start Lab
2. Task 1 `access-daemon`: answer `No` → correct
3. Task 2 `fix-group`: in the terminal run
   `sudo usermod -aG docker student && newgrp docker` → Check → correct
4. Task 3 `count-images`: after `docker pull nginx:alpine alpine:latest` the count is 2 → correct
5. Re-check task 1 (`access-daemon`): still correct (answer-based, state-independent)
6. Task 4 `run-simple-container`:
   `docker run --name alpine-container alpine:latest echo GREETING_FROM_ALPINE` → Check → correct
7. Submit Lab → container destroyed, next item in the path loads

**Manual test (API, faster)** — the lab path now lives on the **orchestrator**
(`localhost:8001`; auth = `Authorization: Bearer $ORCHESTRATOR_SECRET`), not the
backend:
```bash
# start lab with the client-supplied env config (docker-basic resolves to):
curl -s -X POST http://localhost:8001/labs \
  -H "Authorization: Bearer $ORCHESTRATOR_SECRET" -H "Content-Type: application/json" \
  -d '{"user_id":"manual","lab_id":"lab-1","image":"labops-docker:latest","apt_packages":[],"pre_pull":["nginx:alpine","alpine:latest"],"setup":[]}'
# → {session_id, status, container_name}

# exec a validation command in the container (user honors validation.execution_user):
curl -s -X POST http://localhost:8001/labs/<session_id>/exec \
  -H "Authorization: Bearer $ORCHESTRATOR_SECRET" -H "Content-Type: application/json" \
  -d '{"command":"docker image ls | grep nginx","user":"student"}'
# → {exit_code, output} — matching happens client-side
```

> **Note (resolved):** `run-simple-container` is authored with
> `execution_user: root`. With the backend proxy routers removed, the frontend
> forwards `validation.execution_user` as the orchestrator exec `user` field,
> which the orchestrator honors — the old false-negative (backend hardcoding
> `user: student`) no longer exists.

---

## Test 6 — Client content bootstrap (version → download → verify → serve)

**Commits:** `97e5e60` (backend handshake + drop file serving), `b43c9c9`
(frontend bootstrap), `13fb255` (client-supplied lab config).

**Bug/previously-served-state:** the backend used to serve course files from a
mounted `content-v2`; now it serves none. The frontend must bootstrap content
itself and keep working with zero backend content calls.

**User story:** *As a learner, I want the app to fetch its content itself and keep
working even though the backend no longer serves course files.*

**Success criteria**
- [ ] **Cold start** (empty `/app/.content`): first chapter/lab load downloads the
      tarball, verifies sha256, extracts, writes the version marker
- [ ] Subsequent loads are a no-op (marker matches, no re-download)
- [ ] The old backend file routes are **gone**: `GET /api/v1/content/courses` → 404
- [ ] `GET /api/v1/content/version` → `download_url` is fetchable and the sha256
      (first 16 hex) of the **decompressed** tar matches `artifact_sha256`
- [ ] Chapters/labs render from local files with no backend content calls

**Manual test**
```bash
# Fresh local store
$C down -v && $C up --build -d

# 1. Version handshake (public, no auth)
curl http://localhost:8000/api/v1/content/version
#    → {"version":"…","download_url":"…/published/<v>/content.tar.gz","artifact_sha256":"…"}

# 2. Confirm the download URL is reachable + hash matches
curl -sL "$(curl -s http://localhost:8000/api/v1/content/version | python3 -c 'import sys,json;print(json.load(sys.stdin)["download_url"])')" -o /tmp/c.tar.gz
gzip -dc /tmp/c.tar.gz | sha256sum | cut -c1-16   # == artifact_sha256 above (raw tar, not gzip stream)

# 3. Old routes are removed
curl -i http://localhost:8000/api/v1/content/courses | head -1    # HTTP/1.1 404 Not Found

# 4. UI end-to-end: login → open a course → open a chapter (theory) → open lab-1
#    After loading, the local store is populated:
docker compose exec frontend sh -c 'ls /app/.content && cat /app/.content/version'   # (or: $C exec frontend sh -c 'ls /app/.content && cat /app/.content/version')
#    → version file + data/ (index.json, courses/, environments/)

# 5. Local serving proves itself: after a content republish (Test 3) the app
#    re-syncs automatically on the next content request (marker mismatch →
#    re-download). No manual copy, no backend file reads.
```

**Automated:** import `postman/SGP_DockerMastery.postman_collection.json` and run
the suite per `postman/README.md` (~30 requests, folders 0–5). Folder `0.6` is the
regression check that the backend file routes now 404.

---

## Quick reference — endpoint map

| Step | URL | Auth |
|------|-----|------|
| Content version handshake | `GET /api/v1/content/version` | No |
| Catalog / TOC (Firestore) | `GET /api/v1/courses`, `GET /api/v1/courses/{id}` | No |
| Local chapter content | `GET /api/local-content/chapters/{courseId}/{chapterId}` | No |
| Local lab instructions/config/tasks | `GET /api/local-content/labs/{courseId}/{labId}/...` | No |
| Start lab (client-supplied config) | `POST /labs` (orchestrator :8001, Bearer `ORCHESTRATOR_SECRET`) | No |
| Recover live session | `GET /labs/by_key?user_id=&lab_id=` (orchestrator) | No |
| Run validation command | `POST /labs/{session_id}/exec` (orchestrator, `user` = `validation.execution_user`) | No |
| Terminal | `WS /ws/terminal` (orchestrator; token as first message) | No |
| Worker status / force sync | `GET /status`, `POST /sync` | No |
