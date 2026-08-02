# Deferred Improvements — Backlog

These items are tracked for future branches. They are intentionally **out of scope**
for the current lab-validation branch. Once lab validation is complete, branch out,
land these, and re-verify end-to-end.

---

## Item A — Worker: content validation gating + Firestore seed correctness

**Type:** Bug fix (Worker microservice)
**Service:** `worker/`
**Files:** `worker/app/validator.py`, `worker/app/seeder.py`, `worker/app/main.py`

### Problem (verified)
- `_run_sync` (`worker/app/main.py:64-78`) raises on validation failure and
  **never calls `sync_courses`** — Firestore is not updated when content is
  invalid. Running `validate_all` showed it failing with 1 error.
- Validator bug: the monolithic branch requires `validation.command` on *every*
  task, so `multiple_choice` tasks (e.g. task-3 in `lab-1.yaml`) fail with
  `validation.command: Missing required field 'command'`.
- Validator blind spots: `module.yaml` `labs:` refs that resolve to no YAML pass
  silently; labs with zero tasks validate cleanly.
- Seeder quality: `estimatedHours` reads `course_data.get("estimatedHours")` but
  YAML uses `estimated_hours` → always 0; chapter/lab `order` hardcoded to 0;
  `description`/`chapterId` always empty — the Firestore course reference is
  skeletal even after a successful sync.

### Fixes
1. Exempt `multiple_choice` (and file/port check) tasks from the `command`
   requirement in the monolithic branch → `validate_all` = 0 errors.
2. Add a check that each `module.yaml` `labs:` entry resolves to YAML (dir
   `lab.yaml` or flat `{id}.yaml`); warn (not fail) on zero-task labs so
   skeleton labs pass.
3. Seeder: read `estimated_hours`, `order`, `description`, `chapterId` from YAML
   instead of hardcoding defaults.

### Verification
- Start worker → `curl :8002/status` → `docker logs sgp-worker` shows
  `Content validation passed — seeding to Firestore`.
- `courses/{docker-mastery,git-fundamentals}` docs updated with correct hash,
  chapter/lab counts and orders.
- No log files currently exist (container stdout only). Consider persistent
  logging here if wanted.

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
