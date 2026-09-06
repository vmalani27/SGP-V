# LabOps Architecture & Component Blueprint

This document details the end-to-end architecture of **LabOps (SGP-V)**, a containerized, local-first learning platform for hands-on DevOps education.

---

## 1. System Architecture Diagram

```mermaid
flowchart TB
    %% ─────────────────────────────────────────────────────────────
    %% ACTORS & ENTRYPOINTS
    %% ─────────────────────────────────────────────────────────────
    StudentUser(["Student / User Browser\n(http://localhost:3000)"])
    ContentDev(["Content Author / Maintainer"])
    
    %% ─────────────────────────────────────────────────────────────
    %% GITOPS & CI/CD PIPELINES
    %% ─────────────────────────────────────────────────────────────
    subgraph GitOps ["1. GitOps & Image Distribution (GitHub Actions)"]
        direction TB
        subgraph ContentPipeline ["Content Sync Pipeline"]
            Validator["Content Validator\n(scripts/validate_content.py)"]
            ManifestGen["Manifest & Tarball Generator\n(scripts/generate_manifest.py)"]
        end

        subgraph ImagePipeline ["Multi-Image GHCR Pipeline"]
            BuildFe["Build Frontend\n(next-app : Standalone SSR)"]
            BuildBe["Build Backend\n(backend : FastAPI)"]
            BuildOrc["Build Orchestrator\n(orchestrator : FastAPI + uvloop)"]
            BuildLabs["Build Lab Images\n(lab-ubuntu ➔ lab-docker ➔ lab-docker-fundamentals)"]
        end
    end

    %% ─────────────────────────────────────────────────────────────
    %% CLOUD INFRASTRUCTURE (AWS + FIREBASE)
    %% ─────────────────────────────────────────────────────────────
    subgraph CloudInfra ["2. Cloud Control Plane & Content Delivery"]
        direction TB
        S3Bucket[("AWS S3 Content Bucket\n(s3://content-dev-.../published/)")]
        LambdaWorker["AWS Lambda Worker\n(Content Ingest / Manifest Seeder)"]
        FirebaseAuth["Firebase Authentication\n(Identity & JWTs)"]
        FirestoreDB[("Cloud Firestore\n(Courses, Syllabus, User Progress)")]
    end

    %% ─────────────────────────────────────────────────────────────
    %% LOCAL RUNTIME ENVIRONMENT (HOST MACHINE)
    %% ─────────────────────────────────────────────────────────────
    subgraph LocalStack ["3. Local Runtime Stack (Docker Desktop or Vagrant VM)"]
        direction TB
        
        subgraph HostControl ["Host Control Plane"]
            LabopsCLI["Go CLI (labops)\n[doctor | setup | pull | start | stop | logs]"]
        end

        subgraph CoreServices ["Core Platform Services"]
            direction LR
            Frontend["Next.js 15 Frontend (:3000)\n- Standalone Node.js SSR\n- Client React Hydration\n- xterm.js Terminal\n- Local Content Cache (/app/.content)"]
            
            Backend["FastAPI Backend (:8000)\n- Presigned S3 Content URL Signer\n- Course Metadata / Version API\n- Progress Sync Bridge"]
            
            Orchestrator["FastAPI Orchestrator (:8001)\n- Docker SDK Controller\n- Interactive PTY & WebSocket (/ws/terminal)\n- Automated Task Validator Engine\n- GHCR Auto-Pull Fallback"]
        end

        subgraph RuntimeEngine ["Adaptive Container Runtime Engine"]
            direction TB
            RuntimeSwitch{{"Runtime Mode\nSelector"}}
            SysboxRuntime["Sysbox Engine\n(sysbox-runc / Vagrant VM)\n- Rootless user namespace\n- True system container isolation"]
            DockerDesktopRuntime["Docker Desktop Engine\n(runc / WSL2 / macOS Hypervisor)\n- privileged: true\n- Dedicated storage volumes (/var/lib/docker)"]
        end

        subgraph LabSandboxes ["4. Isolated Student Lab Sandbox (labops-lab-*)"]
            direction TB
            Init["systemd Init (PID 1)"]
            InnerDocker["Inner Docker Daemon (dockerd / containerd)"]
            TmuxSession["tmux Session (:demo) + bash shell"]
            PreloadedImages["Preloaded Images (alpine, nginx, python)"]
            CheckValidators["Validation Test Suites (/usr/local/checks)"]
            
            Init --> InnerDocker
            Init --> TmuxSession
            InnerDocker --> PreloadedImages
            TmuxSession --> CheckValidators
        end
    end

    %% ─────────────────────────────────────────────────────────────
    %% CONNECTIONS & DATA FLOWS
    %% ─────────────────────────────────────────────────────────────

    %% Content Authoring Flow
    ContentDev -->|"git push content-v2/"| Validator
    Validator --> ManifestGen
    ManifestGen -->|"Upload content.tar.gz & latest.json"| S3Bucket
    S3Bucket -.->|"S3 ObjectCreated Event"| LambdaWorker
    LambdaWorker -->|"Seed Course Hierarchy & Tasks"| FirestoreDB

    %% Image Distribution Flow
    ContentDev -->|"git push to dev/beta"| ImagePipeline
    ImagePipeline -->|"Push pre-built images"| GHCR[("GitHub Container Registry\n(ghcr.io/vmalani27/sgp-v/*)")]
    GHCR -.->|"docker pull via CLI / Compose"| LocalStack

    %% User & App Interaction Flows
    StudentUser -->|"1. Web UI & Markdown Navigation"| Frontend
    StudentUser -->|"2. Authenticate"| FirebaseAuth
    StudentUser <==>|"3. Interactive Terminal (WebSockets)"| Orchestrator

    %% Internal Communication Flows
    Frontend -->|"A. S3 Presigned URL / Course Version"| Backend
    Frontend -->|"B. Download Content Tarball"| S3Bucket
    Backend <-->|"User Progress & Syllabus"| FirestoreDB
    Frontend -->|"C. Start / Inspect / Grade Lab"| Orchestrator

    %% Orchestrator Management
    Orchestrator --> RuntimeSwitch
    RuntimeSwitch -->|"Vagrant Mode"| SysboxRuntime
    RuntimeSwitch -->|"Desktop Mode"| DockerDesktopRuntime
    SysboxRuntime --> LabSandboxes
    DockerDesktopRuntime --> LabSandboxes

    %% ─────────────────────────────────────────────────────────────
    %% STYLING
    %% ─────────────────────────────────────────────────────────────
    classDef gitops fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef cloud fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef local fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef sandbox fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef registry fill:#ede7f6,stroke:#512da8,stroke-width:2px;

    class GitOps,ContentPipeline,ImagePipeline gitops;
    class CloudInfra,S3Bucket,LambdaWorker,FirebaseAuth,FirestoreDB cloud;
    class LocalStack,HostControl,CoreServices,RuntimeEngine local;
    class LabSandboxes,Init,InnerDocker,TmuxSession,PreloadedImages,CheckValidators sandbox;
    class GHCR registry;
```

---

## 2. Component Directory & Responsibilities

| Component | Technology | Primary Role |
|---|---|---|
| **`next-app` (Frontend)** | Next.js 15, React 19, Tailwind, xterm.js | Standalone SSR web application. Renders markdown course content, manages local tarball cache in `/app/.content`, and streams interactive shell sessions via WebSockets. |
| **`orchestrator`** | FastAPI, Python 3.12, `docker` SDK, `uvloop` | Manages lab container lifecycles (`start`, `stop`, `exec`), bridges terminal PTYs over WebSocket `/ws/terminal`, executes task verification scripts, and auto-pulls missing images from GHCR. |
| **`backend`** | FastAPI, Python 3.12, `google-cloud-firestore`, `boto3` | Generates presigned S3 download URLs for content delivery, syncs user course enrollment and progress state with Firestore. |
| **`lab-images`** | Ubuntu 22.04, systemd, Docker CE, containerd | Self-contained, multi-stage Linux lab environments running full systemd (PID 1) and inner `dockerd` with pre-cached exercise images. |
| **`cli` (`labops`)** | Go 1.22+ (Zero Dependencies) | Cross-platform bootstrap CLI for Windows, macOS, and Linux. Performs preflight checks (`doctor`), image pulling (`pull`), and interactive runtime selection (`start` / `stop`). |
| **`worker` (Lambda)** | Python 3.12 AWS Lambda | Ingests `latest.json` content manifests triggered by S3 uploads, parsing module and task metadata directly into Cloud Firestore. |

---

## 3. Communication Protocols & Security Boundaries

```
Browser  ───(HTTPS / WS)───►  Frontend (:3000)
   │                               │ (internal backendFetch)
   │                               ▼
   ├────────(HTTP / REST)────► Backend (:8000) ──► AWS S3 & Firestore
   │
   └────────(WS / Terminal)──► Orchestrator (:8001) ──► Docker Engine
                                                              │
                                                              ▼
                                                     [ Lab Sandbox ]
                                                     (Inner dockerd)
```

1. **Client Isolation:** The student browser connects to the Orchestrator WebSocket using a shared session secret. The student never has access to the host's `/var/run/docker.sock`.
2. **Inner Docker Isolation (DinD):**
   * **Sysbox Mode (Vagrant/Linux):** Linux user-namespaces map root inside the container to an unprivileged host UID.
   * **Docker Desktop Mode (Windows/macOS):** Runs inside the Hyper-V/Virtualization.framework micro-VM with dedicated `/var/lib/docker` volumes, eliminating overlayfs-on-overlayfs conflicts while isolating the host OS.
3. **Local-First Content Delivery:** The frontend fetches the course content tarball from S3 once, verifies its SHA256 checksum, and extracts it to `/app/.content`, providing fast offline-ready rendering.

