# Client-Side Content Delivery — Implementation Plan

Status: **proposed** — each item lands as its own branch off `dev`, is verified
end-to-end, then merged. `dev` must stay deployable after every merge.

## Goal

Remove the backend's dependence on the repo's `content-v2/` folder entirely.
The backend becomes a **pure metadata + data-location API** (Firestore-backed);
the **client** (frontend + orchestrator on the student's machine) downloads the
published content artifact from a public-read S3 bucket, extracts it into a
local folder, and renders course content from there.

## Target architecture

| Component | Role |
|-----------|------|
| Backend | Firestore API: auth, catalog/TOC metadata, progress, content-integrity checks. `GET /api/v1/content/version` → `{version, download_url, artifact_sha256}`. No file reads, no `content-v2` mount, no `FilesystemProvider`. |
| Worker | S3 → validate → seed Firestore (unchanged) |
| CI | validate + publish artifact to S3 (unchanged) |
| S3 | canonical content bytes, **public read** |
| Client frontend | boot: check `/content/version` → if changed, download tarball → verify sha256 → extract locally → serve TOC/chapters/labs from local files |
| Client orchestrator | runs lab containers; receives env config in the `start` request (no content access) |

## Metadata contract (Firestore `courses` collection)

| Class | Fields |
|-------|--------|
| Source (authored) | `title`, `description`, `level`, `modules[].{id,title,description,order}`, `items[]` |
| Derived (seeder) | `modules[].chapters`, `modules[].labs`, `modules[].items`, `totalChapters`, `totalLabs`, `contentHash` |
| Programmatic | `id` (= doc id), `contentVersion`, `updatedAt`, `createdAt` |
| Removed | `slug`, `estimatedHours` (re-add to `course.yaml` only if genuinely needed) |

**Sync rule:** the worker performs a **full reconciliation** every cycle — it
recomputes the derived document and rewrites Firestore whenever the stored
document differs from what it *would* produce. `contentHash` alone never gates
a write, so stale derived fields can never persist.

---

## Branch plan

Order matters. Items 2 and 3 must land together (removing the mount breaks the
frontend until it can serve locally).

### 1. `fix/firestore-metadata-reconcile` — Worker metadata reconciliation

- `sync_courses()` recomputes the derived doc and rewrites on any difference
  (not just `contentHash` change); `contentHash` stays for cheap skip checks.
- Derive and write `modules[].items` (linear path), `modules[].chapters`,
  `modules[].labs` with correct titles/orders/descriptions.
- Write correct `totalChapters` / `totalLabs` (currently 0 — stale).
- Remove `slug` and `estimatedHours` from the document shape.
- Repair the existing stale Firestore docs (a one-time full re-seed after merge).
- **Verify:** Firestore docs show populated modules + correct totals; second
  sync is a no-op (idempotent); `/status` shows `skipped: 2`.

### 2. `feat/backend-metadata-api` — Backend becomes metadata + data-location only

- Add `GET /api/v1/content/version` → `{version, download_url, artifact_sha256}`
  derived from the `contentVersion` in Firestore + a configured public base URL.
- Serve catalog + course TOC from Firestore (`/api/v1/courses`, `/api/v1/courses/{id}`)
  instead of reading `content-v2`.
- Remove `FilesystemProvider` and the file-serving routes in `content.py`
  (chapters, lab instructions, tasks, config).
- Remove the `./content-v2:/app/content:ro` mount and `CONTENT_DIR` from the
  backend service in `docker-compose.yml`.
- **Verify:** backend boots with no content mount; `/api/v1/courses` returns
  Firestore metadata; `/api/v1/content/version` returns a resolvable S3 URL.

### 3. `feat/client-content-bootstrap` — Frontend downloads + serves locally

- On startup: fetch `/api/v1/content/version`, compare against a local version
  marker; if changed, download `published/{version}/content.tar.gz` from S3,
  verify `artifact_sha256`, extract into a local content dir, write the marker.
- Serve TOC / chapters / lab instructions / lab configs from the local content
  dir instead of the backend file routes.
- Dev wiring: Floci bucket configured public-read; frontend service gets the
  Floci host-gateway + S3 endpoint so it can fetch the artifact.
- **Verify:** cold start with empty local dir downloads + extracts; subsequent
  starts are a no-op; chapters/labs render from local files with no backend
  content calls.

### 4. `feat/lab-client-config` — Labs stop reading content server-side

- `labs.py` `start`/`tasks`/`validate` stop calling `get_content_provider()`.
- The frontend sends the lab environment config (`image`/`apt_packages`/
  `pre_pull`) and task validation specs in the request bodies.
- Backend forwards to the orchestrator exactly as today; orchestrator unchanged.
- **Verify:** `POST .../start`, `GET .../tasks`, `POST .../validate` all work with
  config supplied by the client and no content reads.

### 5. `feat/content-integrity-sync` — Hash-mismatch warnings + auto-sync

- Client sends its local content hash/version on sync calls (submit lab,
  mark chapter read, progress update).
- Backend compares to Firestore `contentHash`/`contentVersion`; on mismatch it
  returns a **warning** (200, not an error), e.g. `warning: content_outdated`.
- Frontend surfaces the warning in the UI and auto-syncs on next boot.
- **Verify:** editing content → republishing → an un-synced client gets the
  warning on its next progress call; boot sync pulls the new version.

### 6. `feat/new-content-badges` — NEW badge with visit-based expiry

- On a version change, diff the new item IDs against the previous version's.
- Persist `{itemId: remainingVisits}` locally (default 2–3).
- Render a NEW badge in the curriculum/sidebar; decrement `remainingVisits` on
  each app load; clear the badge when it reaches 0.
- **Verify:** after a content update, new items show the badge; after N app
  loads the badge disappears and content renders normally.
