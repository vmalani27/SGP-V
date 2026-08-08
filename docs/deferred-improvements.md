# Deferred Improvements — Backlog

These items are tracked for future branches. They are intentionally **out of scope**
for the current lab-validation branch. Once lab validation is complete, branch out,
land these, and re-verify end-to-end.

---

## Item A — Worker: content validation gating + Firestore seed correctness ✅ DONE

**Type:** Bug fix (Worker microservice)  
**Service:** `worker/`  
**Branch:** `fix/worker-validation-seeding`  
**Files:** `worker/app/validator.py`, `worker/app/seeder.py`, `worker/app/main.py`

### Fixes landed
1. Task validation is per-type: `file_check` requires `path` + `contains`, `port_check`
   requires `port` or `path`, `multiple_choice` is exempt from `command`, everything
   else requires `command`.
2. Validator emits **warnings** (not failures) for: `module.yaml` refs that don't exist,
   lab refs with no `labs/{id}/lab.yaml`, environment refs that don't resolve to
   `environments/{name}.yaml`, and skeleton labs with zero tasks. `validate_all` = 0
   errors; warnings don't block seeding.
3. Seeder reads real metadata: 1-based module/chapter/lab `order` (with dict overrides
   preserved), and `description` / `chapterId` from chapter/lab dicts.
4. `_run_sync` no longer raises on validation failure — it records
   `status: validation_failed` and skips seeding gracefully instead of crashing the
   cycle and blocking Firestore updates entirely.

### Verification
- `validate_all(content-v2)` → 0 errors, 7 skeleton-lab warnings (lab-4…lab-10).
- Seeder writes ordered modules/chapters/labs, resolved lab titles, and preserved
  `chapterId`/`description` for both courses; idempotent (skip on unchanged hash).

---

## Item B — S3-backed content provider (MinIO for dev)

**Type:** Feature (Backend content microservice)
**Service:** `backend/`
**Files:** `backend/app/services/content_provider.py`, `backend/app/config.py`,
`backend/app/requirements.txt`, `docker-compose.yml`, new `scripts/upload_content.py`, docs

### Problem / context
`get_content_provider()` only supports `CONTENT_SOURCE=filesystem` and raises for
anything else. The abstraction already anticipates S3 ("filesystem now, S3
later"). No S3/MinIO is available for development.

### Changes
1. Add `boto3` to `backend/app/requirements.txt`.
2. Implement `S3Provider(ContentProvider)` mirroring the `FilesystemProvider` key
   layout — `index.json`, `courses/{id}/course.yaml`,
   `modules/{mod}/module.yaml`, `chapters/{ch}.md`, `labs/{id}/lab.yaml`,
   `labs/{id}.yaml`, `labs/{id}.md`, `environments/{ref}.yaml`. Refactor shared
   parse/title helpers so both providers reuse them. Env config: `S3_BUCKET`,
   `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
   `AWS_REGION`; wire `CONTENT_SOURCE=s3`.
3. Add a `minio` service to docker-compose (port 9000) with an auto-created
   `sgp-content` bucket; backend points at `AWS_ENDPOINT_URL=http://minio:9000`.
   The same provider targets real S3 later by changing the endpoint.
4. `scripts/upload_content.py` — sync `content-v2/` → bucket, skipping unchanged
   files. Worker keeps reading the local filesystem as source of truth for dev.
5. Verify parity: `curl /api/v1/content/courses` + a lab config + tasks with
   `CONTENT_SOURCE=s3` vs `filesystem`.
