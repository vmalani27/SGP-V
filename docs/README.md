# LabOps — Documentation

The single source of truth for **LabOps**, the DevOps learning platform
(KodeKloud-style interactive Git and Docker labs with real, isolated terminal
environments).

These docs are the authoritative reference for the current `SGP-V` project.
They reflect the real architecture: a `content-v2/` YAML source of truth, a
content pipeline (Floci/S3 + CI publish), a `worker` that seeds Firestore, a
purely-metadata `backend`, a `frontend` that bootstraps content from S3, and an
`orchestrator` that runs lab containers inside a Vagrant VM (Docker + Sysbox).

Docs are organized by **category** so you can quickly find the material that matters to you:

---

## 1. Philosophy & Architecture
Understand *why* we are building this and *how* the tools were selected.

| Doc | What it covers |
|-----|----------------|
| [Phase 0](1-philosophy/PHASE-0.md) | Product problem definition, kill criteria, test plan, frozen architecture decisions (*read before new work*) |
| [Architecture & Tools](1-philosophy/architecture-and-tools.md) | Justification for the technology stack (Why Sysbox, Vagrant, Next.js, FastAPI) |
| [`architecture.md`](architecture.md) | Clean Mermaid architecture diagram (located in root of `docs/`) |

## 2. Development & Operations
Guides for building, running, and troubleshooting the platform locally.

| Doc | What it covers |
|-----|----------------|
| [Setup Guide](2-development/setup.md) | Prerequisites, Firebase credentials, **AWS IAM credentials** (dev/beta), Floci S3, publishing, starting the stack + VM |
| [Development Guide](2-development/development.md) | Hot reload, volume mounts, commands, orchestrator VM lifecycle, pitfalls |
| [AWS S3 Private Downloads](aws-s3-private-downloads.md) | Presigned-URL content download, IAM policy + env var setup for private S3 buckets |
| [Manual Testing](2-development/TESTING.md) | End-to-end manual test suite (worker, sync, validation, content bootstrap) |
| [Known Issues & Fixes](2-development/bugs.md) | Resolved root causes + the open group-membership validation bug |
| [Deferred Improvements](2-development/deferred-improvements.md) | Backlog — Items A (done), B (superseded), C (exploratory VM), D (webhook sync, designed) |

## 3. Content Creation & Pipeline
How to write courses and how they are delivered to the students.

| Doc | What it covers |
|-----|----------------|
| [Content Authoring](3-content-creation/CONTENT-AUTHORING.md) | Writing courses, modules, chapters, labs, and task validation |
| [Content Pipeline (Local)](3-content-creation/CONTENT-PIPELINE.md) | The underlying logic of manifest generation, validation, and local S3/Floci |
| [CI/CD Pipeline (Cloud)](3-content-creation/CI-CD-PIPELINE.md) | The production GitOps pipeline (GitHub Actions -> AWS S3 -> Webhook) |

## 4. Deployment
Taking the platform from local development to production.

| Doc | What it covers |
|-----|----------------|
| [Deployment Guide](4-deployment/deployment-guide.md) | Migrating from Vagrant to bare-metal/cloud, scaling the microservices, securing the infrastructure |

## Archive
Historical documents kept for reference.

| Doc | What it covers |
|-----|----------------|
| [Client App Plan](archive/CLIENT-APP-PLAN.md) | Historical plan for the client-side content-delivery model (now implemented) |

---

## Additional References

| Doc | What it covers |
|-----|----------------|
| [Root README](../README.md) | Service table, architecture diagram, content-delivery flow |
| [Service READMEs](../README.md#docs) | `backend/` · `next-app/` · `orchestrator/` · `orchestrator/schemas/` · `postman/` |
| [Postman API suite](../postman/README.md) | End-to-end API collection for the content-delivery flow |

## Codebase at a glance

```
SGP-V/
├── backend/             # FastAPI — pure metadata API
├── worker/              # FastAPI — S3-only content seeder
├── orchestrator/        # FastAPI — lab container lifecycle, Sysbox orchestrator
├── next-app/            # Next.js frontend — content bootstrap and rendering
├── content-v2/          # Canonical course content
├── scripts/             # Python CI scripts
├── provisioning/        # Vagrant VM provisioning
├── postman/             # Postman test suites
├── .github/workflows/   # CI/CD
├── docker-compose.local.yml  # Local stack: floci + worker + backend + frontend
├── docker-compose.dev.yml    # Dev stack: worker + backend + frontend + orchestrator (real AWS S3)
├── docker-compose.beta.yml   # Beta stack: worker + backend + frontend (real AWS S3)
├── environments/             # Per-env sealed config (gitignored: *.env.*, firebase keys)
├── Vagrantfile          # Orchestrator VM
└── docs/                # You are here
```
