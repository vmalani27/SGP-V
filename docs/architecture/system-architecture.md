# LabOps System Architecture & Delivery Reference

This document provides a technically grounded reference of the LabOps architecture based on current implementation code in the repository.

It is structured into three concrete architectural views:
1. **System Deployment & Runtime Topology**
2. **Release, Publishing & Artifact Delivery**
3. **Interactive Lab Execution & Lifecycle Flow**

---

## Technical Baseline & Verified Implementation Findings

Before inspecting the architectural views, the following source-level behaviors are verified:

1. **Tag-Based Image Pulls (Digest Metadata Only)**:
   - In [`cli/update.go`](file:///d:/vanshmalanidata/Document/GitHub/SGP-V/cli/update.go#L95-L108) and [`cli/start.go`](file:///d:/vanshmalanidata/Document/GitHub/SGP-V/cli/start.go#L450-L485), `GetManagedImages` reads `meta.Remote` (e.g. `public.ecr.aws/.../labops-frontend:v0.4.0`) and passes it directly to `docker pull <imageName>`.
   - The SHA-256 digest recorded in the manifest (`meta.Digest`) is logged as audit metadata in the release manifest and `images.json`, but the CLI currently executes pulls by **tag name**, not by immutable content digest (`repo@sha256:...`).
2. **Mutable Gitea Component**:
   - `git-server` references `labops-git-server:latest` with an empty digest string (`"digest": ""`). It is not pinned to channel-specific releases, making it mutable across deployments.
3. **Dual Runtime Modes (Sysbox vs. Privileged Fallback)**:
   - When running on a supported Linux host or inside WSL2 where `sysbox-runc` is present, `CONTAINER_RUNTIME_MODE=sysbox` is active (`runtime: "sysbox-runc"`, `privileged: false`).
   - When running under Docker Desktop or environments lacking Sysbox, the system falls back to `CONTAINER_RUNTIME_MODE=privileged` (`runtime: runc`, `privileged: true`).

---

## View 1: System Deployment & Runtime Topology

This view illustrates the physical host boundaries, the programmatic container initialization by the CLI, network routing, and volume mount relationships.

```mermaid
flowchart TB
    subgraph Host ["User Host Machine (Windows / WSL2 / Native Linux)"]
        CLI["LabOps CLI (labops start)"]

        subgraph Storage ["Persistent Local Storage (~/.labops)"]
            UserDataDir["~/.labops (User Data & Progress)"]
            ContentDir["~/.labops/content (Curriculum Bundle)"]
            GitDataDir["~/.labops/git-data (Gitea Repositories & DB)"]
        end

        subgraph DockerHost ["Docker Engine Daemon (dockerd)"]
            Socket["/var/run/docker.sock"]

            subgraph BridgeNet ["Docker Bridge Network: labops-net"]
                Proxy["Proxy Gateway (Nginx)<br/>Port 80 -> Host 3000"]
                Frontend["Frontend (Next.js SSR)<br/>Port 3000 (Internal)"]
                Orchestrator["Orchestrator (FastAPI)<br/>Port 8000 (Internal)<br/><i>privileged: true (host root)</i>"]
                GitServer["Git Server (Gitea)<br/>Port 3000 (Internal)<br/>Debug Port 3001 -> Host 3001"]
                ContentSync["Content Sync Sidecar<br/>(Background Polling Daemon)"]
            end

            subgraph LabContainers ["Dynamic Lab & Demo Execution Layer"]
                direction TB
                SysboxLab["Secure Student Lab Container<br/><b>Runtime: sysbox-runc</b><br/>privileged: false<br/>Nested dockerd + systemd"]
                PrivLab["Fallback Student Lab Container<br/><b>Runtime: runc (standard)</b><br/>privileged: true<br/>Direct host daemon escape risk"]
            end
        end
    end

    Browser["User Web Browser"] -->|"HTTP / WS (:3000)"| Proxy

    CLI -->|"1. API / Socket Commands"| Socket
    CLI -->|"2. Pre-warms Images"| DockerHost
    CLI -->|"3. Provisions Storage"| Storage

    Proxy -->|"location /"| Frontend
    Proxy -->|"location /ws/ & /labs & /demos"| Orchestrator
    Proxy -->|"location /git/"| GitServer

    Socket -->|"Mount Socket"| Orchestrator
    Orchestrator -->|"Docker API: Create & Exec"| LabContainers

    GitDataDir -.->|"Mount /data"| GitServer
    ContentDir -.->|"Mount /content (rw)"| ContentSync
    ContentDir -.->|"Mount /app/.content (ro)"| Frontend
    UserDataDir -.->|"Mount /app/.user_data"| Frontend

    LabContainers -.->|"Shared Network: http://git-server:3000"| GitServer
```

---

## View 2: Release, Publishing & Artifact Delivery

This view traces code modifications through the GitHub Actions release pipeline to Amazon S3, CloudFront, and ECR Public, highlighting how the CLI and `content-sync` sidecar retrieve separate artifacts.

```mermaid
flowchart LR
    subgraph GitHub ["GitHub Repository & CI (GitHub Actions)"]
        Source["Source Code Push / Tag"]
        
        subgraph Workflow ["publish-dev.yml / release-tag.yml"]
            BuildContent["Build & Pack Content<br/><code>generate_manifest.py</code>"]
            BuildImages["Build Multi-arch Images<br/><code>docker buildx</code>"]
            GenManifest["Assemble Release Manifest<br/><code>generate_release_manifest.py</code>"]
            CompileCLI["Cross-Compile Go CLI<br/>(Win/Linux/macOS)"]
        end
    end

    subgraph AWSCloud ["AWS Infrastructure"]
        subgraph ECR ["Amazon ECR Public"]
            ECRStack["Stack Images<br/>(frontend, orchestrator, proxy, sync)"]
            ECRLabs["Lab Base Images<br/>(labops-ubuntu, labops-docker, etc.)"]
            ECRGit["labops-git-server:latest<br/><i>(Mutable reference)</i>"]
        end

        subgraph Distribution ["Amazon S3 + CloudFront CDN"]
            RelManifest["/releases/{channel}.json<br/>(Image tag maps & content version)"]
            ContentTar["/published/{hash}/content.tar.gz<br/>(Curriculum bundle & catalog.json)"]
            CLIBinaries["/downloads/labops-*<br/>(Executable binaries)"]
        end
    end

    subgraph Client ["Client Runtime (Local Machine)"]
        CLI["LabOps CLI"]
        SyncSidecar["content-sync Container"]
        LocalContentDir["Local Storage: ~/.labops/content"]
        LocalDockerCache["Local Docker Image Cache"]
    end

    Source --> Workflow
    BuildContent -->|"content.tar.gz & latest.json"| GenManifest
    BuildImages -->|"Push Tags & Record Digests"| ECR
    BuildImages -->|"images.json metadata"| GenManifest
    CompileCLI -->|"Upload CLI Binaries"| CLIBinaries

    GenManifest -->|"Upload Manifests"| RelManifest
    BuildContent -->|"Upload Immutable Content"| ContentTar

    CLI -->|"1. Polls channel manifest"| RelManifest
    CLI -->|"2. PreloadImages (pulls by tag)"| ECR
    ECR -->|"Populates local image cache"| LocalDockerCache

    SyncSidecar -->|"Independent 15m poll"| RelManifest
    SyncSidecar -->|"Downloads tarball & untars"| ContentTar
    SyncSidecar -->|"Writes courses & catalog"| LocalContentDir
```

---

## View 3: Interactive Lab Execution & Session Lifecycle

This view details the end-to-end request flow when a student navigates a curriculum slide, launches a terminal, and interacts with the lab environment.

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student Browser
    participant Proxy as Nginx Proxy (:3000)
    participant NextJS as Frontend (Next.js)
    participant Orch as Orchestrator (:8000)
    participant Docker as Docker Daemon / Sysbox
    participant Lab as Lab Container (tmux)
    participant Gitea as Gitea (git-server:3000)

    %% Session Start
    Student->>Proxy: GET /dashboard & /course/...
    Proxy->>NextJS: Forward request
    NextJS-->>Student: Render Slide UI (reads local content)

    Student->>Proxy: POST /labs {image: "docker-fundamentals"}
    Proxy->>Orch: Forward POST /labs
    Orch->>Docker: Inspect local image (tag alias: labops-docker-fundamentals:latest)
    
    alt Image missing from cache
        Orch->>Docker: Fallback on-demand pull from ECR
    end

    Orch->>Docker: Create container (Runtime Mode: sysbox-runc or privileged)
    Docker-->>Lab: Boot container (starts systemd + dockerd)
    Docker-->>Orch: Container started
    Orch->>Lab: Wait for dockerd ready (`docker info` poll)
    Orch-->>Proxy: Return {session_id, token, container_name}
    Proxy-->>Student: 200 OK Lab session active

    %% Terminal Connection
    Student->>Proxy: WebSocket connect: /ws/terminal
    Proxy->>Orch: Upgrade WS connection
    Student->>Orch: First WS message: {"type": "auth", "token": "<secret>"}
    Orch->>Orch: Validate HMAC token claims (session_id)
    Orch->>Lab: Attach to tmux session (`tmux attach-session -t labops`)
    Lab-->>Student: Terminal stream attached (xterm.js interactive shell)

    %% Git Operations Inside Lab
    Student->>Lab: Type `git push origin main`
    Lab->>Gitea: HTTP POST http://git-server:3000/student/repo.git (labops-net)
    Gitea-->>Lab: 200 OK (pack received)
    Lab-->>Student: Terminal output: "remote: Resolving deltas: 100%... To http://git-server:3000/..."
```
