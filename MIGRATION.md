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
- `content-v2/courses/{id}/course.json` — pure TOC (modules, chapters, labs, ordering). No quiz data, no correct answers, no embedded content.
- `content-v2/courses/{id}/modules/{module-id}/chapters/{chapter-id}.md` — theory markdown
- `content-v2/courses/{id}/modules/{module-id}/labs/lab-{n}.md` — lab instructions
- `content-v2/courses/{id}/modules/{module-id}/labs/lab-{n}.yaml` — environment + validation tasks
- Worker `validator.py` validates v2 schema: index, course.json TOC, markdown existence, lab YAML structure
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
| Folder structure | Flat `module-1/` with 21 files from 4 modules | `modules/{module-id}/chapters/` + `modules/{module-id}/labs/` | Hierarchy is self-documenting |
| course.json | 664 lines: TOC + quiz questions + correct answers + explanations | Pure TOC (~180 lines): IDs, titles, ordering only | No answers leak to frontend |
| Quiz system | Static: frontend receives `correct_answer` in JSON | Dynamic: validation runs in Docker container | Correct answers never leave the server |
| Worker sync | Synced monolithic course.json | Syncs nested module structure with `contentHash` | Idempotent, detects changes |
| Backend content serving | Proxy to orchestrator | Direct filesystem reads via `ContentProvider` abstraction | Removes unnecessary network hop; S3 swap is one class away |
| Enrollment progress | Flat chapter completion | Nested `{moduleId: {chapterId: status}}` | Matches v2 TOC structure |
| Orchestrator responsibilities | Content serving + Docker execution | Docker execution only | Separation of concerns |

### Tradeoffs made

**1. Static quizzes removed entirely**
- Before: easy to author, instant feedback, but answers leaked
- After: all validation is lab-based (Docker container). No lightweight assessment for theory-only chapters.
- Acceptance: during rapid development, lab-only validation is sufficient. Can add optional static comprehension quizzes later as a separate concern.

**2. course.json is append-only by convention**
- The TOC is the enrollment contract. Once users are enrolled, the module/chapter structure defines what "100% complete" means.
- See "Course Immutability Rules" below for the full policy.

**3. contentHash uses only course.json + lab YAMLs**
- Chapter markdown is not included in the hash because content changes (typo fixes, rewording) don't affect enrollment structure.
- If chapter content changes need to be surfaced to users (e.g. "this chapter was updated"), that requires a separate `contentVersion` field. Not implemented yet.

**4. Worker still uses polling (300s interval)**
- Event-driven sync via S3 notifications is the target architecture. Current polling is fine for development with 2 courses.
- See "Deployment Architecture" below.

**5. Backend no longer proxies to orchestrator for content**
- Phase 2 complete. Backend reads content-v2 filesystem directly via `ContentProvider` abstraction.
- `FilesystemProvider` reads from local directory. When S3 comes, write `S3Provider` and set `CONTENT_SOURCE=s3`.
- `httpx` kept in requirements for future Phase 3 (orchestrator lab validation calls).

**6. Orchestrator is now labs-only (Phase 3 complete)**
- `orchestrator/app/api/content.py` deleted. Content serving moved entirely to backend.
- Orchestrator has zero knowledge of course structure — it only manages Docker containers.
- `CONTENT_DIR` env var removed from orchestrator config and docker-compose.
- `content-v2` volume mount removed from orchestrator in docker-compose.

---

## Locked Decisions

### Decision 1: Single source of truth
`content-v2/` is the only source. No other system holds course structure authoritatively. Firestore is a cache written by the worker. Backend reads content via `ContentProvider` abstraction (filesystem now, S3 later).

### Decision 2: Service responsibilities (one each)

| Service | Reads from content-v2 | Writes to | Does NOT do |
|---------|----------------------|-----------|-------------|
| **Worker** | `index.json`, `course.json` | Firestore `courses` | Serve content |
| **Backend** | `course.json` (TOC), `chapters/*.md`, `labs/*.yaml` | Firestore `users`, `enrollments` | Run Docker containers |
| **Orchestrator** | (no content) | Docker containers | Serve course content |
| **Frontend** | Nothing (all from backend API) | — | Directly access filesystem or orchestrator |

### Decision 3: Data flow (unidirectional)
```
content-v2/ (source of truth on disk / S3)
    │
    ├──→ Worker ──→ Firestore courses (metadata cache, idempotent sync)
    │
    ├──→ Backend ──→ Frontend (TOC, chapter content, lab metadata)
    │       │
    │       └──→ Orchestrator (lab lifecycle: start, validate, stop)
    │
    └──→ Orchestrator (Docker lifecycle only: start, exec, stop, destroy)
```

### Decision 4: Quiz/validation model
No static quizzes. All validation is dynamic and runs in the lab container:
- Frontend shows prompt + dynamic options
- Student answers → backend → orchestrator runs validation command in container
- Orchestrator returns output, backend compares, returns pass/fail
- **Correct answers never leave the server**

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
| Fix typo in course.json title/description | Yes | None — metadata only |
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
1. **Worker validator rejects structural changes.** Add a `--check-structure` mode that diffs the new course.json against the Firestore document and fails if modules/chapters/labs are removed or reordered.
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
- Backend reads `course.json` and markdown from S3 (or a local cache seeded from S3)
- Backend serves chapter content directly — no filesystem mount needed
- Orchestrator still reads lab YAMLs from S3 for environment config

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

**New endpoints added:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/content/courses` | Course catalog (from index.json) |
| `GET /api/v1/content/courses/{id}` | Course TOC (from course.json) |
| `GET /api/v1/content/courses/{id}/chapters/{chapterId}` | Chapter markdown + metadata |
| `GET /api/v1/content/courses/{id}/labs` | Lab list for a course |
| `GET /api/v1/content/courses/{id}/labs/{labId}/instructions` | Lab instructions markdown |
| `GET /api/v1/content/courses/{id}/labs/{labId}/config` | Lab YAML config (env + validation tasks) |

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

Orchestrator now has zero content knowledge. Backend reads lab YAML, extracts environment config, and forwards to orchestrator. `COURSE_LAB_MAP` removed — orchestrator accepts `{image, lab_id}` directly.

Backend proxy endpoints:

| Endpoint | Proxies to |
|----------|-----------|
| `POST /api/v1/labs/courses/{id}/labs/{labId}/start` | `POST /labs` |
| `GET /api/v1/labs/courses/{id}/labs/{labId}/status/{sid}` | `GET /labs/{sid}` |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/stop/{sid}` | `POST /labs/{sid}/stop` |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/resume/{sid}` | `POST /labs/{sid}/resume` |
| `DELETE /api/v1/labs/courses/{id}/labs/{labId}/{sid}` | `DELETE /labs/{sid}` |
| `POST /api/v1/labs/courses/{id}/labs/{labId}/exec/{sid}` | `POST /labs/{sid}/exec` |

### Phase 4: Frontend adapts to new data model
1. Rewrite `content-types.ts` (remove static quiz types, add lab task types)
2. Rewrite `QuizSection` → `LabTaskRunner` (dynamic tasks from YAML, not static questions)
3. Update `content-server.ts` for new backend response shapes
4. Remove all references to `correct_answer` / `explanation` in frontend

### Phase 5: Clean up
1. Delete old `orchestrator/schemas/lab-sample.yaml` (lab YAMLs live in content-v2)
2. Remove dead imports, unused types, stale env vars
3. Update READMEs
4. Write all 18 remaining lab YAML files (authoring work, not engineering)

---

## Risks

1. **Lab YAML authoring** — 2 of 20 labs have YAML files. 18 more need creation. This is content authoring, not engineering.
2. **Frontend lab task runner** — replacing static quizzes with dynamic task runners that interact with a running container through the backend is a significant rewrite.
3. **No quiz = no lightweight assessment** — theory chapters have no way to check understanding without spinning up a container. Consider optional static comprehension quizzes as a future addition.
4. **Backend-orchestrator API contract** — what does `POST /labs/{id}/validate` look like? Needs definition before Phase 3.
