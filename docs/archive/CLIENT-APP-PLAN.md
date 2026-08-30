# Client-Side Content Delivery — Implementation Plan

Status: **proposed** — each item lands as its own branch off `dev`, is verified
end-to-end, then merged. `dev` must stay deployable after every merge.

## Goal

Remove the backend's dependence on the repo's `content-v2/` folder entirely.
The backend becomes a **pure metadata + data-location API** (Firestore-backed);
the **client** (frontend + orchestrator on the student's machine) downloads the
published content artifact from a public-read S3 bucket, extracts it into a
local folder, and renders course content from there.

## The flow in plain words (user/dev story)

The whole product flow, end to end, with no component names. This is the reason
the rest of the plan exists.

**A bug is found in a lesson.**

1. **The developer fixes the content.** They edit the course files in the repo
   (a chapter, a lab, a typo in a title). Nothing else — no database edits, no
   manual uploads.

2. **A push publishes it.** Pushing to `dev` triggers CI, which automatically:
   - validates the content (chapters and labs must be well-formed),
   - computes a version from the content itself (same content = same version,
     so an unchanged push changes nothing),
   - uploads **only the files that changed** to the public content store (S3).

3. **The system notices.** The worker checks the store periodically (a few
   minutes), sees the new version, downloads it, verifies its integrity, and
   updates the course metadata (titles, chapter/lab lists, counts) in the
   database.

4. **The learner's app finds out on its own.** The next time a learner opens the
   app, it compares the content version it has stored locally against the live
   one. If they differ, the app:
   - downloads the new content **directly from the public store** — the backend
     is never in the path of moving content around,
   - verifies the download is intact and unmodified,
   - uses it locally from then on.

5. **The learner sees what's new.** The app shows a small **NEW** badge on
   exactly the course, chapter, or lab that changed — only what's actually new,
   not everything.

6. **The badge doesn't nag.** A badge disappears as soon as the learner opens
   that new item — but it can never vanish before they've had a chance to
   notice it (a 48-hour floor), and it can never linger longer than a week (a
   7-day cap). Learners who ignore it get it cleaned up for them.

That's it. Content has exactly one source of truth (the published store), the
backend stays a metadata + auth API, and the learner's app is self-sufficient
with the content it has downloaded.

**Local-development note:** while this plan is being built, the app may still
read content straight from the repo for fast iteration. That is a temporary
convenience for testing — the flow above is the product behavior once the plan
lands.

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

### 6. `feat/new-content-badges` — NEW badge with engage-to-dismiss expiry

- On a version change, diff the new item IDs against the previous version's.
- Persist `{itemId: firstSeenAt}` locally for each newly added item.
- Render a NEW badge in the curriculum/sidebar for those items.
- Dismiss the badge when the learner **opens the new item** — reuse the existing
  "chapter read / lab started" progress events, so no separate tracking system.
- Expiry rule — the badge disappears on the **first** of:
  - the item was opened **and** at least 48 hours have passed since it appeared
    (an accidental glance or automated load must never hide it early), or
  - 7 days since it first appeared (hard cap — it can never linger longer).
- **Verify:** after a content update, new items show the badge; opening one
  after the 48h floor removes its badge; double-visits/reloads never hide a
  badge early; untouched badges disappear after 7 days.
