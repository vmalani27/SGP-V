# LabOps Architecture Diagram

This is the auto-generated, clean architectural diagram for the entire SGP-V (LabOps) platform. It covers the end-to-end flow from content authoring and CI/CD publishing to the student's browser and the orchestrated Sysbox sandboxes.

```mermaid
flowchart TB
    %% Definitions
    Student([Student Browser])
    Developer([Content Developer])
    
    subgraph GitHub [GitHub Actions CI/CD Pipeline]
        Validator[Content Validator]
        Packager[Tarball Generator]
    end
    
    subgraph Cloud [Cloud Backend Infrastructure - Dev/Beta/Prod]
        S3[(AWS S3 Content Bucket)]
        LambdaWorker[Lambda Worker / Seeder]
        LambdaAPI[Lambda Backend API]
        Firestore[(Firestore DB)]
    end
    
    subgraph Vagrant [Local Vagrant VM Sandbox]
        Frontend[Next.js Frontend\n:Port 3000]
        Orchestrator[FastAPI Orchestrator]
        Sysbox[(Docker Engine + Sysbox)]
        
        subgraph Labs [Isolated Lab Containers]
            Linux[Ubuntu Lab]
            Git[Git Lab]
            DinD[Docker-in-Docker]
        end
    end

    %% Pipeline Flow
    Developer -- "Git Push (content-v2/)" --> Validator
    Validator --> Packager
    Packager -- "1. Upload content.tar.gz" --> S3
    Packager -- "2. Sync Webhook Trigger" --> LambdaWorker
    LambdaWorker -- "3. Read manifest.json" --> S3
    LambdaWorker -- "4. Seed Metadata" --> Firestore

    %% App Integration Flow
    Student -- "accesses" --> Frontend
    Frontend -- "A. API: Fetch Course Metadata" --> LambdaAPI
    Frontend -- "B. API: Sync Progress Data" --> LambdaAPI
    LambdaAPI <--> Firestore
    
    Frontend -- "C. Direct Bootstrap: Download Tarball" --> S3
    
    %% Local Orchestration Flow
    Frontend -- "D. REST / WebSocket" --> Orchestrator
    Orchestrator -- "Manage Runtimes" --> Sysbox
    Sysbox --> Linux
    Sysbox --> Git
    Sysbox --> DinD

    %% Styling
    classDef gitops fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef cloud fill:#ffe0b2,stroke:#f57c00,stroke-width:2px;
    classDef vm fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef container fill:#fafafa,stroke:#757575,stroke-width:1px;
    
    class GitHub,Validator,Packager gitops;
    class Cloud,S3,LambdaWorker,LambdaAPI,Firestore cloud;
    class Vagrant,Frontend,Orchestrator,Sysbox vm;
    class Linux,Git,DinD container;
```

### Components Breakdown:

1. **GitHub Actions CI/CD Pipeline:** Contains the validator and package generator. Checks YAML/Markdown formats, produces `content.tar.gz` and `manifest.json`, and uploads them to AWS S3.
2. **Cloud Backend & Infrastructure (AWS + Firestore):**
   - **AWS S3 Bucket**: Serves as the storage bucket for content tarballs.
   - **Lambda Worker**: A serverless function triggered via webhook to parse the new `manifest.json` and seed Firestore.
   - **Lambda Backend API**: Serves metadata to the frontend via API calls, handles user state / progression syncing, and does not serve content bytes or speak to the orchestrator.
   - **Firestore DB**: Holds course metadata index and user progress.
3. **Local Vagrant VM Sandbox (Student Machine):**
   - Runs a lightweight Vagrant VM. The **Next.js Frontend** is exposed (on Port 3000) to the student.
   - The **FastAPI Orchestrator** is internal to the VM and orchestrates the **Docker Engine + Sysbox** runtime to spin up secure, unprivileged system containers (Ubuntu, Git, Docker-in-Docker) for hands-on tasks.
   - Once the content tarball is bootstrapped from S3, the application runs entirely locally, only syncing progression back to the cloud database.

