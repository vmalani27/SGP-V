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

## Item B — S3-backed content provider (MinIO for dev) ❌ SUPERSEDED

> **Superseded.** This plan assumed the backend would serve content from S3 to a
> cloud-hosted frontend. The architecture moved to a **client-side app** instead
> (see `CONTENT-PIPELINE.md` §9): the frontend + orchestrator run on the
> student's machine and download the published artifact directly from a
> public-read S3 bucket. The backend is a pure Firestore API and will **not**
> build an `S3Provider`. Content publishing is implemented via
> `scripts/generate_manifest.py` + `.github/workflows/publish-content.yml`
> (dev S3 = local Floci). Kept below for history.

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

---

## Item C — Disposable Ubuntu VM for orchestrator hosting (exploratory)

**Type:** Hosting option under evaluation

This is not the current default architecture. It is one possible way to host the
lab orchestrator for development or packaged distribution, with the VM treated
as disposable infrastructure rather than the source of truth.

### Baseline contract

| Component | Specification |
|-----------|---------------|
| Hypervisor | VMware Workstation / VirtualBox |
| Guest OS | Ubuntu Server 22.04.5 LTS |
| Architecture | x86_64 / amd64 |
| vCPU | 2 |
| RAM | 4 GB recommended |
| Disk | 40 GB, dynamically allocated |
| Network | NAT with DHCP |
| Host access | Fixed port forwarding preferred over depending on the VM IP |
| SSH | Optional, but recommended |
| Docker Engine | 28.5.2 |
| Docker runtime | Standard Docker + Sysbox |
| Sysbox CE | 0.7.0 |
| sysbox-runc | 0.7.0 |

### Intended use

- Start from a minimal Ubuntu Server install.
- Provision Docker and Sysbox inside the VM.
- Run the orchestrator inside the VM.
- Expose the orchestrator with host port forwarding, for example `localhost:8000` → VM `:8000`.
- Keep credentials out of the VM image or OVA.
- Treat the VM as rebuildable from repository notes and provisioning scripts.

### Reproducibility note

The repository should eventually hold the provisioning contract for this path,
for example under `infra/vm/` with version pins, autoinstall material, and shell
scripts for Docker/Sysbox installation and configuration.

### Lifecycle sketch

Fresh Ubuntu VM → install Docker → install Sysbox → configure runtimes → obtain
SGP software → build or pull lab images → configure networking → start
orchestrator → SGP environment ready.

### Distribution variants

- Development: git clone, checkout a known version, build and run.
- Distribution: pull a versioned container image and run.

### Vagrant note

If Vagrant proves reliable for reproducing the VM baseline, it becomes a useful
machine-as-code wrapper around this path: a developer can provision the exact
Ubuntu + Docker + Sysbox environment from versioned notes instead of rebuilding
it manually. If that works end to end, it should reduce setup time for small
rollouts and make the host environment easier to reset when it drifts.

This option stays exploratory until it proves simpler than the current
deployment path for the chosen audience.

---

## Item D — Webhook-triggered worker sync (pipeline → `POST /sync`) 📝 DESIGNED, NOT WIRED

**Type:** Enhancement (Worker + CI)  
**Status:** Design documented in `docs/CONTENT-PIPELINE.md` §6 ("Triggered
sync (webhook)"). Not implemented.

### Problem / context

Publishing is push (CI → S3) but seeding is pull (worker polls S3 every
`SYNC_INTERVAL_SECONDS`, default 300s), so a published version can sit in S3
for up to five minutes before Firestore reflects it. The trigger idea was
discussed after a checksum-mismatch incident: it is webhook logic (a nudge to a
runtime service), not a reason to fold the worker into CI — the worker is a
runtime S3→Firestore consumer that holds Firestore write credentials, while CI
holds only S3 credentials.

### Design

1. `.github/workflows/publish-content.yml`: after the S3 upload (`latest.json`
   last), add a "Trigger worker sync" step that calls the worker
   `POST /sync` (worker URL + shared-secret header via `secrets`).
2. `worker/app/main.py`: gate `POST /sync` behind a shared-secret header token
   (`X-Sync-Token`) before the worker is reachable outside dev. The 300s poll
   stays as a self-healing reconciliation net, so a missed/failed webhook is
   caught later by the cycle.
3. Optionally raise `SYNC_INTERVAL_SECONDS` (e.g. 15 min) once the webhook is
   the primary trigger.

### Guarantees (why this is safe)

- Idempotent: `download_content()` short-circuits when the version is already
  seeded + verified; `sync_courses()` is a full reconcile, so re-triggering is
  always a no-op or a correct rewrite.
- Integrity is unchanged: the webhook only starts a cycle; the worker still
  verifies `artifact_sha256` + the per-file manifest and refuses mismatched
  artifacts (hard failure — see `docs/bugs.md`).

### Acceptance

- Push to `dev` → worker `/status` shows the new `published_version` within
  seconds, not minutes.
- Re-running the workflow / parallel pushes do not corrupt Firestore (idempotent).
- `POST /sync` without the token returns `4xx`.
