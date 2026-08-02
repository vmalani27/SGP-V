# LabOps — Architecture & Migration Plan

## Completed Work

### Merged repos, deleted dead code
- Merged `SGP_v_docker_labs` (orchestrator) into `SGP_V`
- Deleted all old `content/` directories (root, backend, orchestrator, worker)
- Deleted dead `backend/app/scripts/seed_courses.py`
- Deleted old frontend lab components
- Removed stale imports (`_get_course_lab_count` from `backend/app/routers/courses.py`)
- Removed all `Dockerfile.dev` files and `docker-compose.dev.yml`

### Single Dockerfile + single docker-compose per service
- Each service has one `Dockerfile` (uvicorn `--reload` for all Python services)
- Single `docker-compose.yml` — no dev/prod split
- All services mount `./content-v2:/app/content:ro`

### Phase 1 complete — content-v2 is the source of truth

**What was built:**

- `content-v2/index.json` — course catalog with `version: "2.0"`
- `content-v2/environments/{name}.yaml` — shared environment definitions (base_image, pre_pull, apt_packages)
- `content-v2/courses/{id}/course.yaml` — primary TOC (module references). Falls back to `course.json`.
- `content-v2/courses/{id}/modules/{module-id}/module.yaml` — module metadata with lab/chapter references
- `content-v2/courses/{id}/modules/{module-id}/chapters/{chapter-id}.md` — theory markdown
- `content-v2/courses/{id}/modules/{module-id}/labs/{lab-id}/lab.yaml` + `instructions.md` — per-lab directory format
- `content-v2/courses/{id}/modules/{module-id}/labs/lab-{n}.yaml` — old monolithic format (backward compat)
- Worker `validator.py` validates both YAML and JSON course files, both flat and monolithic lab formats
- Worker `seeder.py` syncs nested module/chapter/lab structure to Firestore with `contentHash` for idempotent upserts; removes orphaned courses
- Backend `PUT /api/v1/courses/{courseId}/progress` endpoint persists `{moduleId: {chapterId: status}}` to enrollment
- Backend `GET /api/v1/users/me/enrollments` computes `percentage` per enrollment using `totalChapters` from Firestore courses
- Frontend `ChapterClient` accepts `moduleId`, calls `api.courses.updateProgress()` on quiz completion
- Frontend `LearningPlayer` and `CourseProgressHeader` read enrollment progress for sidebar/checkmarks/progress bar
- All 4 services running, worker verified: 2 courses synced, 0 validation errors

---

## Changes and Tradeoffs

### What changed

| Area | Before | After | Why |
|------|--------|-------|-----|
| Source of truth | `content/` (old) + `content-v2/` (new) coexisting | `content-v2/` only | Single authority eliminates confusion |
| Course TOC format | `course.json` only | `course.yaml` (primary) + `course.json` (fallback) | YAML is more author-friendly; JSON kept for backward compat |
| Folder structure | Flat `module-1/` with 21 files from 4 modules | `modules/{module-id}/chapters/` + `modules/{module-id}/labs/{lab-id}/` | Hierarchy is self-documenting |
| Lab format | Monolithic `lab-1.yaml` with phases + inline env | Per-lab `lab.yaml` + `instructions.md`, shared env ref | One lab per file, environment config externalized |
| Environment config | Inline dict in each lab YAML | Shared `environments/{name}.yaml` referenced by string | Single source of truth for base images, pre-pull lists |
| course.json | 664 lines: TOC + quiz questions + correct answers + explanations | Pure TOC (~180 lines): IDs, titles, ordering only | No answers leak to frontend |
| Quiz system | Static: frontend receives `correct_answer` in JSON | Dynamic: validation runs in Docker container via exec | Correct answers never leave the server |
| Worker sync | Synced monolithic course.json | Syncs nested module structure with `contentHash` | Idempotent, detects changes |
| Worker validator | Validated only JSON course.json | Validates YAML + JSON, both flat and monolithic lab formats | Supports both content structures |
| Backend content serving | Proxy to orchestrator | Direct filesystem reads via `ContentProvider` abstraction | Removes unnecessary network hop; S3 swap is one class away |
| Backend lab proxy | Frontend→Orchestrator directly | Frontend→Backend→Orchestrator | Auth, session tracking, usage analytics |
| Enrollment progress | Flat chapter completion | Nested `{moduleId: {chapterId: status}}` | Matches v2 TOC structure |
| Orchestrator responsibilities | Content serving + Docker execution | Docker execution only | Separation of concerns |
| Validation flow | `validator.sh` scripts baked in images | Frontend-driven exec + client-side comparison | No need to rebuild images for task changes |

### Tradeoffs made

**1. Static quizzes removed entirely**
- Before: easy to author, instant feedback, but answers leaked
- After: all validation is lab-based (Docker container). No lightweight assessment for theory-only chapters.
- Acceptance: during rapid development, lab-only validation is sufficient. Can add optional static comprehension quizzes later as a separate concern.

**2. Course TOC is append-only by convention**
- The module/chapter/lab structure defines what "100% complete" means once users are enrolled.
- See "Course Immutability Rules" below for the full policy.

**3. contentHash uses course TOC + lab YAMLs only**
- Chapter markdown is not included in the hash because content changes (typo fixes, rewording) don't affect enrollment structure.
- If chapter content changes need to be surfaced to users (e.g. "this chapter was updated"), that requires a separate `contentVersion` field. Not implemented yet.

**4. Worker still uses polling (300s interval)**
- Event-driven sync via S3 notifications is the target architecture. Current polling is fine for development with 2 courses.
- See "Deployment Architecture" below.

**5. Backend serves content directly**
- Phase 2 complete. Backend reads content-v2 filesystem directly via `ContentProvider` abstraction.
- `FilesystemProvider` reads from local directory. When S3 comes, write `S3Provider` and set `CONTENT_SOURCE=s3`.

**6. Orchestrator is now labs-only (Phase 3 complete)**
- `orchestrator/app/api/content.py` deleted. Content serving moved entirely to backend.
- Orchestrator has zero knowledge of course structure — it only manages Docker containers.
- `CONTENT_DIR` env var removed from orchestrator config and docker-compose.

**7. Two lab formats coexist**
- Old monolithic `lab-1.yaml` with phases + inline environment still works (backward compat).
- New flat format `hello-world/lab.yaml` with environment reference is the future direction.
- Content provider reads both transparently. No router changes needed.

---

## Locked Decisions

### Decision 1: Single source of truth
`content-v2/` is the only source. No other system holds course structure authoritatively. Firestore is a cache written by the worker. Backend reads content via `ContentProvider` abstraction (filesystem now, S3 later).

### Decision 2: Service responsibilities (one each)

| Service | Reads from content-v2 | Writes to | Does NOT do |
|---------|----------------------|-----------|-------------|
| **Worker** | `index.json`, `course.yaml`/`course.json`, `module.yaml`, `lab.yaml` | Firestore `courses` | Serve content |
| **Backend** | `course.yaml`/`course.json`, `module.yaml`, `chapters/*.md`, `labs/*/lab.yaml`, `environments/*.yaml` | Firestore `users`, `enrollments` | Run Docker containers |
| **Orchestrator** | (no content) | Docker containers | Serve course content, read lab files |
| **Frontend** | Nothing (all from backend API) | — | Directly access filesystem or orchestrator directly |

### Decision 3: Data flow (unidirectional)
```
content-v2/ (source of truth on disk / S3)
    │
    ├──→ Worker ──→ Firestore courses (metadata cache, idempotent sync)
    │
    ├──→ Backend ──→ Frontend (TOC, chapter content, lab config, tasks)
    │       │
    │       └──→ Orchestrator (lab lifecycle: start, exec, stop, destroy)
    │
    └──→ Orchestrator (Docker lifecycle only: start, exec, stop, destroy)
```

### Decision 4: Validation model
All validation is exec-based. The frontend drives validation by sending commands through the backend to the orchestrator:

1. Frontend reads task definitions from backend's content API
2. Student completes the task in the lab terminal
3. Student clicks "Check"
4. Frontend sends `POST /labs/{id}/exec` with the validation command
5. Orchestrator runs the command in the container, returns output
6. Frontend compares output to `expected_output` using `match_type`
7. **Correct answers never leave the server** (expected_output is in the YAML, only the comparison happens client-side)

A legacy `validator.sh` endpoint still exists but is being phased out.

### Decision 5: No dead code policy
- Old `content/` directory deleted
- Old `seed_courses.py` deleted
- Old `Dockerfile.dev` / `docker-compose.dev.yml` deleted
- Any dead import or unused type gets removed immediately

---

## Course Immutability Rules

### The problem
Enrollment progress is stored as `{moduleId: {chapterId: "completed"}}`. The enrollment document's "100% complete" is computed by comparing completed chapters against `totalChapters` from the Firestore courses document. If the course structure changes after enrollment, the progress map can become invalid:
- A chapter the user completed is deleted → progress is orphaned, percentage is wrong
- A module is reordered → user's progress references the old order
- A new chapter is added → user's progress looks complete but they haven't done the new chapter

### The rule (locked)

**Once a course has enrolled users, it is structurally immutable. Changes are append-only.**

| Change type | Allowed? | Effect on existing enrollments |
|-------------|----------|-------------------------------|
| Fix typo in chapter markdown | Yes | None — content changes don't affect structure |
| Fix typo in lab YAML | Yes | None — validation commands may change but structure doesn't |
| Fix typo in course.yaml title/description | Yes | None — metadata only |
| Add a new module at the end | Yes | Existing users' `totalChapters` is stale. New module doesn't appear in their curriculum until they re-enroll or we add migration logic |
| Add a chapter to an existing module at the end | Yes | Existing users' `totalChapters` is stale — their percentage becomes inaccurate until they complete the new chapter. This is acceptable |
| Add a lab to an existing module | Yes | Same as adding a chapter |
| Reorder modules | **No** | Invalidates progress map order references |
| Delete a module | **No** | Orphaned progress entries, wrong percentage |
| Delete a chapter | **No** | Orphaned progress entry, wrong percentage |
| Rename a module/chapter ID | **No** | Progress map keys no longer match — effectively deletes all progress for that module |
| Move a chapter between modules | **No** | Progress map references wrong parent module |

### Enforcement during rapid development (pre-launch)

Before the course has real users, these rules are relaxed. During active authoring:
- IDs are stable (chapter-1, chapter-2, etc.) — renaming is fine if no Firestore data exists
- Structure can be reorganized freely as long as Firestore is cleared (`worker` re-seeds on next sync)
- The `contentHash` makes re-seeding idempotent — no manual Firestore cleanup needed

### Enforcement post-launch

Once real users exist:
1. **Worker validator rejects structural changes.** Add a `--check-structure` mode that diffs the new course TOC against the Firestore document and fails if modules/chapters/labs are removed or reordered.
2. **Firestore courses document gets a `structuralHash`** (separate from `contentHash`) that covers only module/chapter/lab IDs and ordering. Worker checks this before writing.
3. **Backend refuses to serve a course whose structuralHash doesn't match Firestore** — prevents stale content from reaching users.

This is not implemented yet. For now, the convention is: append-only, don't rename IDs.

---

## Deployment Architecture (future)

### Current: local filesystem
```
content-v2/  →  docker volume mount  →  all services
```
Worker polls the filesystem every 300s. Fine for development with 2 courses.

### Target: S3 + event-driven worker

```
┌─────────────┐     S3 event      ┌─────────────┐
│  S3 Bucket  │──────────────────→│   Worker     │
│ (content-v2)│   (PUT/DELETE)    │ (Lambda or   │
│             │                   │  ECS task)   │
└──────┬──────┘                   └──────┬──────┘
       │                                  │
       │  GET (presigned URL)            │  sync metadata
       │                                  ▼
       │                          ┌──────────────┐
       │                          │   Firestore   │
       │                          │  (courses)    │
       │                          └──────────────┘
       │
       ▼
┌─────────────┐
│   Backend    │  reads from S3 (presigned URLs or CloudFront)
│  (FastAPI)   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Frontend    │
└─────────────┘
```

**Why S3:**
- Decouples content authoring from deployment. Content team pushes to S3, no rebuild needed.
- Backend can serve content via presigned URLs or CloudFront — no need to mount volumes.
- Worker can be a Lambda triggered by S3 `ObjectCreated`/`ObjectDeleted` events — no polling needed.
- S3 versioning provides audit trail and rollback for content changes.

**Why event-driven worker:**
- Instant sync: content change in S3 → worker validates → Firestore updated within seconds
- No idle container polling when nothing changes
- Lambda cold start is acceptable for content sync (runs few times per day during development)

**What changes for backend:**
- Backend reads course TOC and markdown from S3 (or a local cache seeded from S3)
- Backend serves chapter content directly — no filesystem mount needed
- Orchestrator still receives environment config from backend (no changes needed)

### How S3 + event-driven sync affects enrollments

The same immutability rules apply, but the enforcement path changes:

1. **S3 event triggers worker.** Worker validates the change against Firestore `structuralHash`.
2. **If structural change detected** → worker rejects the sync, writes to a dead-letter queue, alerts. The course content in S3 is ahead of what users are enrolled in.
3. **If metadata-only change** (title, description, typo fix) → worker updates Firestore. No enrollment impact.
4. **If append-only structural change** (new module at end) → worker updates Firestore `courses` document. Existing enrollments are unaffected — their progress map still references valid modules/chapters. `totalChapters` increases but existing users' percentage drops slightly (acceptable during active authoring).
5. **Backend serves content from S3 version.** If a chapter was updated, users see the latest version. Their enrollment progress is unchanged because the chapter ID didn't change.

### Migration path to S3

| Step | What changes | Status |
|------|-------------|--------|
| 1 | Add `CONTENT_SOURCE` env var to backend | ✅ Done (defaults to `filesystem`) |
| 2 | Backend reads from S3 — implement `S3Provider` in `content_provider.py` | Pending |
| 3 | Worker reads from S3 instead of local filesystem | Pending |
| 4 | Replace worker polling with S3 event → Lambda | Pending |
| 5 | Remove `content-v2` volume mounts from docker-compose | Pending |
| 6 | Add `structuralHash` to worker for immutability enforcement | Pending |

---

## Migration Plan (remaining phases)

### Phase 2: Backend owns content serving ✅
1. ~~Rewrite `backend/app/routers/content.py` to read filesystem directly~~ — Done
2. ~~Add chapter content endpoint~~ — Done
3. ~~Add lab YAML endpoint~~ — Done
4. ~~Create `backend/app/services/content_provider.py` — `ContentProvider` ABC + `FilesystemProvider` implementation~~ — Done
5. ~~Add `CONTENT_DIR` and `CONTENT_SOURCE` env vars to `backend/app/config.py`~~ — Done
6. ~~Add `pyyaml` to backend requirements~~ — Done
7. ~~All content API endpoints verified — backend serves content without orchestrator~~ — Done

**Content API endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/content/courses` | Course catalog (from index.json) |
| `GET /api/v1/content/courses/{id}` | Course TOC (from course.yaml with module.yaml resolution) |
| `GET /api/v1/content/courses/{id}/chapters/{chapterId}` | Chapter markdown + metadata |
| `GET /api/v1/content/courses/{id}/labs` | Lab list for a course |
| `GET /api/v1/content/courses/{id}/labs/{labId}/instructions` | Lab instructions markdown |
| `GET /api/v1/content/courses/{id}/labs/{labId}/config` | Lab YAML config (environment resolved + tasks) |
| `GET /api/v1/content/courses/{id}/labs/{labId}/tasks` | Lab tasks (extracted from both flat and monolithic formats) |

**Content provider architecture:**

```
ContentProvider (ABC)
  ├── FilesystemProvider   ← active (CONTENT_SOURCE=filesystem)
  └── S3Provider           ← future (CONTENT_SOURCE=s3)
```

To swap to S3: implement `S3Provider`, add `CONTENT_SOURCE=s3` env var, remove volume mount. No router changes.

### Phase 3: Orchestrator becomes labs-only ✅
1. ~~Delete `orchestrator/app/api/content.py`~~ — Done
2. ~~Keep only lab execution endpoints (`/labs`, `/exec`, WebSocket terminal)~~ — Done
3. ~~Remove `CONTENT_DIR` from orchestrator config~~ — Done
4. ~~Remove `content-v2` volume mount from orchestrator in docker-compose~~ — Done
5. Update orchestrator README — Done

Orchestrator now has zero content knowledge. Backend reads lab YAML, resolves environment config, and forwards to orchestrator. `COURSE_LAB_MAP` removed — orchestrator accepts `{image, lab_id}` directly.

Backend proxy endpoints:

| Endpoint | Proxies to |
|----------|-----------|
| `POST /api/v1/labs/courses/{id}/labs/{labId}/start` | `POST /labs` |
| `GET /api/v1/labs/courses/{id}/labs/{labId}/active` | `GET /labs/{sid}` |
| `GET /api/v1/labs/courses/{id}/labs/{labId}/status/{sid}` | `GET /labs/{sid}` |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/stop/{sid}` | `POST /labs/{sid}/stop` |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/resume/{sid}` | `POST /labs/{sid}/resume` |
| `DELETE /api/v1/labs/courses/{id}/labs/{labId}/{sid}` | `DELETE /labs/{sid}` |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/exec/{sid}` | `POST /labs/{sid}/exec` |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/token/{sid}` | (JWT generation, no proxy) |

### Phase 3.5: Content format evolution
1. Added `course.yaml` support (YAML-first, JSON fallback) — Done
2. Added `module.yaml` resolution for module references — Done
3. Added per-lab directory format (`labs/{lab-id}/lab.yaml` + `instructions.md`) — Done
4. Added shared environment definitions (`environments/{name}.yaml`) — Done
5. Added `GET /tasks` endpoint extracting tasks from both formats — Done
6. Updated lab schema to validate both flat and monolithic formats — Done
7. Updated validator to accept both YAML and JSON course files — Done
8. Old monolithic `lab-1.yaml` still works for backward compat — Done

### Phase 4: Frontend adapts to new data model
1. Rewrite `content-types.ts` (remove static quiz types, add lab task types)
2. Rewrite `QuizSection` → `LabTaskRunner` (dynamic tasks from YAML, not static questions)
3. Update `content-server.ts` for new backend response shapes
4. Remove all references to `correct_answer` / `explanation` in frontend

### Phase 5: Clean up
1. Remove dead imports, unused types, stale env vars
2. Verify task definitions for all labs (3 done, 7 metadata-shells pending)

---

## Risks

1. **Lab YAML authoring** — 3 labs have full task definitions (lab-1/hello-world, images, env-vars). 7 more need task definitions (labs 4-10 have metadata-only shells). This is content authoring, not engineering.
2. **Frontend lab task runner** — replacing static quizzes with dynamic task runners that interact with a running container through the backend is a significant rewrite.
3. **No quiz = no lightweight assessment** — theory chapters have no way to check understanding without spinning up a container. Consider optional static comprehension quizzes as a future addition.
