# LabOps Architecture & Component Blueprint

This document details the end-to-end architecture of **LabOps (SGP-V)**, a local-first, containerized learning platform for hands-on DevOps education.

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
    subgraph GitOps ["1. GitOps & CDN Publishing (GitHub Actions)"]
        direction TB
        subgraph ContentPipeline ["Content Sync Pipeline"]
            Validator["Content Validator\n(scripts/validator.py)"]
            Packager["Deterministic Tarball & Catalog Generator\n(scripts/validate_content.py)"]
            CloudFront[("AWS CloudFront CDN + S3\n(d3rqfqpemi0u1s.cloudfront.net)\n- latest.json\n- catalog.json\n- published/<sha>/content.tar.gz")]
        end

        subgraph ImagePipeline ["Multi-Image Amazon ECR Pipeline"]
            BuildFe["Build Frontend (Next.js 15)"]
            BuildSync["Build Content-Sync Sidecar (Go)"]
            BuildOrc["Build Orchestrator (FastAPI)"]
            BuildLabs["Build Lab Images (Ubuntu, Docker)"]
            ECR[("Amazon ECR / ECR Public\n(public.ecr.aws/vmalani27/*)")]
        end
    end

    %% ─────────────────────────────────────────────────────────────
    %% LOCAL RUNTIME ENVIRONMENT (HOST MACHINE)
    %% ─────────────────────────────────────────────────────────────
    subgraph LocalStack ["2. Local Student Workspace (Docker on WSL2 / Native Linux / Desktop)"]
        direction TB
        
        subgraph HostControl ["Host Control Plane"]
            LabopsCLI["Go CLI (labops)\n[start | stop | restart | status | update | doctor | logs]"]
        end

        subgraph HostStorage ["Local Host Persistence (~/.labops/)"]
            UserState[("user_state.json\n- Student Identity\n- Course Enrollments\n- Chapter Checkpoints\n- Lab Progress")]
            ContentCache[("content/\n- Extracted Markdown\n- Course Metadata\n- Lab Task Configs")]
        end

        subgraph CoreServices ["Core Platform Services (Docker Compose)"]
            direction LR
            Proxy["Nginx Gateway (:3000)\n- Single host entrypoint\n- Unified HTTP / WebSocket router"]
            Frontend["Next.js 15 Frontend\n- Local Course Catalog\n- Chapter Player & Tasks\n- xterm.js Terminal UI\n- Local-First User State"]
            Sidecar["Content-Sync Sidecar (Go)\n- Background CDN Poller (<8MB RAM)\n- SHA256 Verification\n- Auto-syncs to /content"]
            Orchestrator["FastAPI Orchestrator\n- Docker SDK Controller\n- Interactive PTY & WebSocket (/ws/terminal)\n- Pre-Warmed tmux Sessions\n- Automated Task Validator Engine"]
        end

        subgraph RuntimeEngine ["Adaptive Container Runtime Engine"]
            direction TB
            RuntimeSwitch{{"Runtime Mode\nSelector"}}
            SysboxRuntime["Sysbox Engine\n(sysbox-runc / WSL2 / Linux)\n- Rootless user namespace\n- Systemd + inner dockerd"]
            DockerDesktopRuntime["Docker Desktop Fallback\n(runc / WSL2 / macOS Hypervisor)\n- privileged: true\n- Dedicated storage volumes (/var/lib/docker)"]
        end

        subgraph LabSandboxes ["3. Isolated Student Lab Sandbox (labops-lab-*)"]
            direction TB
            Init["systemd Init (PID 1)"]
            InnerDocker["Inner Docker Daemon (dockerd / containerd)"]
            TmuxSession["tmux Session (:lab) + bash shell"]
            PreloadedImages["Preloaded Images (alpine, nginx, python)"]
            CheckValidators["Validation Test Suites"]
            
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
    Validator --> Packager
    Packager -->|"Upload static bundles"| CloudFront

    %% Image Distribution Flow
    ContentDev -->|"git push to dev/beta"| ImagePipeline
    ImagePipeline -->|"Push container images"| GHCR
    GHCR -.->|"Pull pre-built images"| LocalStack

    %% Sync & Content Flow
    Sidecar -->|"Poll & pull releases (latest.json)"| CloudFront
    Sidecar -->|"Extract into shared volume"| ContentCache
    Frontend <-->|"Read curriculum files"| ContentCache
    Frontend <-->|"Read & persist progress"| UserState

    %% User Interaction Flow
    StudentUser <-->|"1. Access Learning Portal"| Proxy
    Proxy -->|"HTTP /"| Frontend
    Proxy -->|"WS /ws/terminal"| Orchestrator
    Proxy -->|"REST /labs/*"| Orchestrator

    %% Orchestrator Management
    Orchestrator --> RuntimeSwitch
    RuntimeSwitch -->|"Native WSL2 / Linux"| SysboxRuntime
    RuntimeSwitch -->|"Desktop Fallback"| DockerDesktopRuntime
    SysboxRuntime --> LabSandboxes
    DockerDesktopRuntime --> LabSandboxes
    LabopsCLI -.->|"Supervise lifecycle"| CoreServices
```

---

## 2. Component Directory & Responsibilities

| Component | Technology | Primary Role |
|---|---|---|
| **`proxy` (Gateway)** | Nginx Alpine | Single unified reverse proxy on port 3000. Routes frontend SSR/static assets, orchestrator REST endpoints (`/labs/`, `/demos/`, `/health`), and WebSocket terminal sessions (`/ws/terminal`). |
| **`next-app` (Frontend)** | Next.js 15, React 19, Tailwind, xterm.js | Standalone SSR web application. Reads curriculum directly from local filesystem (`/app/.content`), manages student progress locally in `~/.labops/user_state.json`, and coordinates task validation. |
| **`content-sync` (Sidecar)** | Go 1.22+ (Alpine, < 8MB RAM) | Continuous background daemon. Polls CloudFront CDN (`latest.json`), validates SHA256 checksums, and safely extracts curriculum releases into the shared `/content` volume. |
| **`orchestrator`** | FastAPI, Python 3.12, Docker SDK, uvloop | Manages student sandbox lifecycles (`start`, `stop`, `exec`), bridges terminal PTYs over WebSocket `/ws/terminal` with pre-initialized `tmux` sessions, and executes task grading commands without exposing verification answers. |
| **`cli` (`labops`)** | Go 1.22+ (Zero Dependencies) | Cross-platform bootstrap CLI for Windows, macOS, and Linux. Provides zero-plumbing lifecycle controls (`start`, `stop`, `restart`, `status`, `update`, `doctor`, `logs`). |
| **`lab-images`** | Ubuntu 22.04, systemd, Docker CE, containerd | Self-contained Linux lab environments running full systemd (PID 1) and inner `dockerd` with pre-cached exercise images. |

---

## 3. Communication Protocols & Security Boundaries

```
Browser  ───(HTTP / WS on port 3000)───►  Nginx Gateway Proxy (:3000)
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   │                                                           │
                   ▼ (HTTP /)                                                  ▼ (WS & REST /labs)
           Next.js Frontend (:3000)                                     FastAPI Orchestrator (:8000)
                   │                                                           │
                   ▼                                                           ▼
      [ Local User State & Content ]                                     Docker Engine Socket
       (~/.labops/user_state.json)                                             │
                                                                               ▼
                                                                      [ Lab Sandbox (labops-lab-*) ]
                                                                      - systemd (PID 1)
                                                                      - inner dockerd
                                                                      - isolated tmux session
```

1. **Client Isolation:** The student browser connects to the Orchestrator WebSocket using a shared session secret. The student never has access to the host's `/var/run/docker.sock`.
2. **Inner Docker Isolation (DinD):**
   * **Sysbox Mode (WSL2 / Linux):** Linux user-namespaces map root inside the container to an unprivileged host UID.
   * **Docker Desktop Mode (Windows / macOS):** Runs inside the WSL2 / Hyper-V utility VM with dedicated `/var/lib/docker` volumes, eliminating overlayfs conflicts while isolating the host OS.
3. **Local-First Autonomy:** The platform functions completely offline once course materials and images are downloaded. All user progress and checkpoints are stored directly on the host machine in `~/.labops/user_state.json`.

