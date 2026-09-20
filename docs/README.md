# LabOps — Documentation

The single source of truth for **LabOps**, the DevOps learning platform
(KodeKloud-style interactive Git and Docker labs with real, isolated terminal
environments).

These docs are the authoritative reference for the current `SGP-V` project.
They reflect the modern local-first architecture: a `content-v2/` YAML source of truth,
an automated CDN distribution pipeline (GitHub Actions -> AWS S3 / CloudFront CDN),
a lightweight Go background sidecar (`sidecars/content-sync`) or CLI sync,
a 100% local-first Next.js `frontend` (persisting user state to `~/.labops/user_state.json`),
and an `orchestrator` that manages isolated Docker/Sysbox lab containers.
All user interactions are unified under a single public address (`http://localhost:3000`) via Nginx reverse proxy.

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
| [Base Images](2-development/base-images.md) | Current Docker base images, stages, and lab-image inheritance |
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
| [Root README](../README.md) | System overview, architecture diagram, and service mapping |
| [Service READMEs](../README.md#architecture--components) | `next-app/` · `orchestrator/` · `cli/` · `proxy/` · `sidecars/` |
| [Postman API suite](../postman/README.md) | End-to-end API collection for orchestrator endpoints |

## Codebase at a glance

```
SGP-V/
├── cli/                 # Go CLI binary (`labops`) — cross-platform launcher & manager
├── next-app/            # Next.js 15 frontend — local-first player, catalog & user state
├── orchestrator/        # FastAPI service — lab container lifecycle & WebSocket terminal
├── proxy/               # Nginx reverse proxy routing http://localhost:3000
├── sidecars/            # Background helper daemons (e.g., content-sync from CDN)
├── content-v2/          # Canonical course content (Git, Docker, Linux labs)
├── scripts/             # Validation and build scripts
├── postman/             # Postman test suites
├── .github/workflows/   # CI/CD (content publish, image build, CLI release)
├── docker-compose.yml   # Production / local stack (frontend, orchestrator, proxy, sync)
└── docs/                # Documentation suite
```
