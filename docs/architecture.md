# LabOps Architecture Diagram

This is the auto-generated, clean architectural diagram for the entire SGP-V (LabOps) platform. It covers the end-to-end flow from content authoring and CI/CD publishing to the student's browser and the orchestrated Sysbox sandboxes.

```mermaid
flowchart TB
    %% Definitions
    Student([Student Browser])
    Author([Content Author])
    
    subgraph Cloud [Cloud Infrastructure]
        GitHub[GitHub Actions CI/CD]
        S3[(AWS S3 Content Bucket)]
        Firebase[(Firebase / Firestore)]
    end
    
    subgraph Host [Host Machine / docker-compose]
        Frontend[Next.js Frontend\n:3000]
        Backend[FastAPI Backend\n:8000]
        Worker[Python Worker\n:8002]
    end
    
    subgraph VM [Vagrant VM / Orchestrator]
        Orchestrator[FastAPI Orchestrator\n:8001]
        Docker[(Docker Engine + Sysbox)]
        
        subgraph Containers [Ephemeral Lab Containers]
            Linux[Ubuntu Lab]
            Git[Git Lab]
            DinD[Docker-in-Docker Lab]
        end
    end

    %% Content Pipeline Edges
    Author -- "Git Push (content-v2/)" --> GitHub
    GitHub -- "Validate & Upload" --> S3
    GitHub -- "Webhook Trigger" --> Worker
    Worker -- "Download manifest.json" --> S3
    Worker -- "Seed Metadata (Courses)" --> Firebase

    %% Student App Edges
    Student -- "HTTPS (UI)" --> Frontend
    Frontend -- "Auth / Profile" --> Firebase
    Frontend -- "Content Bootstrap (tar.gz)" --> S3
    Frontend -- "REST API (JSON)" --> Backend
    Frontend -- "REST (Lab/Demo Lifecycle + Validation Exec)" --> Orchestrator
    Frontend -- "WebSocket (Terminal)" --> Orchestrator
    Backend -- "Enrollments & Progress" --> Firebase
    
    %% Orchestration Edges
    Orchestrator -- "docker.sock" --> Docker
    Docker --> Linux
    Docker --> Git
    Docker --> DinD
    
    %% Styling
    classDef cloud fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef host fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px;
    classDef vm fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef container fill:#fff3e0,stroke:#f57c00,stroke-width:1px;
    
    class Cloud cloud;
    class Host host;
    class VM vm;
    class Linux,Git,DinD container;
```

### Components Breakdown:

1. **GitHub Actions + AWS S3:** The single source of truth for course content. Assets are packed into tarballs and synced directly to S3.
2. **Next.js Frontend:** Bootstraps course content directly from S3 (bypassing the backend for static assets), ensuring lightning-fast client-side routing.
3. **Python Worker:** Dedicated solely to seeding Firestore with structural course metadata (so the backend has an index for enrollment validation).
4. **FastAPI Backend:** Handles user state only—authentication, enrollments/progress, and the content-version handshake (`GET /api/v1/content/version` → S3 download URL). It serves **no** content bytes and makes **no** calls to the orchestrator.
5. **Orchestrator (Vagrant VM):** A tightly locked-down VM running Sysbox. The frontend talks to it **directly**—REST for lab/demo lifecycle and validation `exec`, WebSocket (`/ws/terminal`) for low-latency terminal rendering. It spawns per-student containers on the VM's Docker Engine.
