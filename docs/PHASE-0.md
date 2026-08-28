# LabOps — Phase 0: Problem Definition

Status: **hypothesis, untested**. Nothing below is validated market fact. This
document exists so every future change can answer one question: *does this serve
the instructor pilot?* If a PR cannot point at a numbered item here, it does not
get built.

---

## 1. Primary user (chosen first customer)

An **instructor or trainer running hands-on DevOps education for a group of
students** — bootcamp instructor, college TA / lab assistant, corporate trainer
running a Git/Docker workshop.

Students are the **end users**, not the customer. They consume what the
instructor sets up; nobody interviews students to decide what gets built.

Explicitly NOT the first customer (deferred, not rejected):

| Persona | Why deferred |
|---------|--------------|
| Self-serve individual learner (B2C) | Current landing copy targets them (`next-app/app/page.tsx`); that copy is stale under this decision |
| Institution / administrator buying seats | Sales cycle incompatible with solo builder; requires everything below plus procurement |
| Self-hosting developer | Accidental persona of the current architecture; not chosen |

## 2. Primary problem — two separable hypotheses

These die independently and are tested separately.

### Hypothesis A — Reproducible environments

Instructors cannot rely on student machines: locked-down laptops, Windows +
Docker Desktop friction, version drift, "works on my machine." Every minute a
student spends installing Docker is a minute stolen from the lesson, and every
setup failure consumes the room's attention.

### Hypothesis B — Automated verification

Instructors will not manually grade 30 terminals. Today verification means
screen-sharing, spot-checking, or trusting self-reported completion. Tasks must
validate themselves the moment the student runs the right command.

## 3. Current alternatives (documented, not assumed)

| Alternative | What it covers | Where it hurts |
|-------------|----------------|----------------|
| Manual: "install Docker, clone this repo" + walk around | Everything | Setup chaos, irreproducible, ungradable |
| GitHub Classroom (free) | Distribution, roster, autograding via CI scripts | No live runtime — feedback arrives as CI logs after push; no interactive terminal inside the lesson |
| KodeKloud / Killercoda (hosted labs) | Polished browser labs, instant checks | Content is theirs; instructors cannot author their own scenarios or see their own cohort |
| Screen-share grading / VNC into machines | Verification | Does not scale past ~5 students |

## 4. LabOps specific advantage

Not "autograding" (a commodity) and not "browser terminal" (a commodity). The
wedge is the combination, aimed at someone none of the above serves:

1. **Live in-browser terminal with task-level instant feedback inside the
   lesson** — wrong command turns red immediately with a hint ladder; no
   push-wait-read-CI-logs loop (beats GitHub Classroom on experience).
2. **Sysbox-grade isolation** — real systemd, real Docker daemon per student;
   scenarios can go deeper than CI-script sandboxes (DinD labs actually work).
3. **Cohort visibility for the instructor** — who did what, correctly, when —
   against *their own* scenarios, which hosted catalog products cannot offer.

If a 60-second side-by-side demo against GitHub Classroom doesn't make #1
visibly obvious, the wedge is not real.

## 5. One-sentence proposition

> LabOps lets instructors deliver hands-on Git/Docker labs where every student
> gets an isolated real environment in the browser and each task verifies itself
> instantly — no student machine setup, no manual grading, and the instructor
> sees exactly who completed what.

## 6. Kill criteria (agreed before testing)

| Criterion | Kills |
|-----------|-------|
| Fewer than 3 of 10 interviewed instructors rank environment setup OR grading in their top-2 pains | Hypothesis A+B framing; re-interview before any build |
| Their students can self-install Docker without incident (pre-imaged CS labs, admin-rights corporate rooms) | Hypothesis A alone; product narrows to B |
| Instructors already satisfied with GitHub Classroom grading AND demo delta isn't obvious | Hypothesis B edge; reconsider positioning |
| After a live pilot the instructor declines session #2 and won't discuss paying | Whole thesis; return to Phase 0 |

## 7. Test plan (ordered by cost)

1. **Interviews (~zero cost):** 8–10 working instructors. Ask "walk me through
   your last lab session"; listen for screen-share grading, SSH-into-student,
   spreadsheets, setup chaos. Do not pitch.
2. **Concierge pilot (~minimal code):** one instructor, 3–5 students, one
   session, one course, infra operated by us on one host. Requirements gate:
   Gap Register items 1–3 below must exist first.
3. **Wedge demo (~one day):** recorded side-by-side vs GitHub Classroom flow.

Pilot success metrics: instructor lab-ready < 15 min; student reaches first
shell < 60 s; zero environment-related interruptions mid-session; instructor can
answer "who did what, correctly?" within 5 min after class from persisted data.

## 8. Architecture decisions frozen by this choice

Choosing the instructor customer locks the trust model. These are decided, not
open for relitigation per-feature:

| Decision | Rationale |
|----------|-----------|
| **Hosted, single-tenant pilot.** The stack runs on infrastructure we control; the orchestrator leaves the student's machine. | Students must configure nothing (that is the product). |
| **CLIENT-APP-PLAN items 5–6 (integrity-sync warnings, NEW badges) are killed.** | They optimize solo-learner retention — the deferred persona. |
| **Client-side bootstrap direction frozen.** Existing mechanism may run, but is not extended. Task definitions and validation specs move server-side before any paid use. | Today expected answers ship inside the public tarball and are served by unauthenticated routes (`next-app/app/api/local-content/labs/[courseId]/[labId]/tasks/route.ts`). Tolerable for a friendly pilot; disqualifying otherwise. |
| **Client-supplied `image` / `setup` / validation specs in request bodies are accepted only for the pilot.** Server-held lab definitions become mandatory at customer #2. | An instructor-trusted platform cannot let the student's browser hold the answer key or choose the container image. |
| **No RBAC system, quotas, multi-tenancy, or billing now.** Unauthenticated orchestrator risk is consciously accepted for the pilot (single host, known cohort) and revisited at customer #2. | Pilot scale is n=1 instructor. Building tenancy before demand repeats the original mistake. |
| Course structural immutability rules (CONTENT-PIPELINE.md §11) stay and gain priority. | A cohort mid-course is exactly what those rules protect. |

## 9. Gap register — minimum work before the pilot

Ordered. Anything outside this list waits.

1. **Persist per-task results server-side:** `{taskId, passed, attempts,
   timestamp}` per lab attempt. Today progress is binary `"completed"` strings
   with no history — no instructor view is possible without this.
   *Status: implemented — `taskResults.{moduleId}.{labId}.{taskId}` written
   best-effort by the backend on every validation
   (backend/app/routers/labs.py `_record_task_result`).*
2. **Cohort view v0:** one page querying enrollments for one instructor's
   course. A raw Firestore query behind a login is acceptable for the pilot.
3. **Minimal instructor identity:** a Firebase custom claim (`role=instructor`)
   verified by the backend. Not a role system — one bit.
4. **Content depth:** all labs in ONE course fully authored (task definitions,
   not skeletons). Currently most labs are metadata stubs; the pilot runs on
   whichever course is finished first.
5. **Fix the known validation false-negative** (docs/bugs.md): in a classroom
   this bug is 30 simultaneous support tickets, not a curiosity.

Authoring remains git-push-by-us during the pilot (concierge mode). An authoring
UI is explicitly NOT pilot scope.

## 10. Standing rule

Every PR description includes one line:

```
Phase 0: serves item <n> / kills criterion <n> / out of scope (reason)
```

If the third option appears often enough, Phase 0 is wrong — revisit it, don't
route around it.
