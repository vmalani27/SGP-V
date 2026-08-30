# GitOps Content Pipeline (CI/CD)

The LabOps platform treats course content exactly like source code. Content changes are validated, built, and delivered via an automated CI/CD pipeline using GitHub Actions, pushing to AWS S3.

## Architecture Overview

```mermaid
flowchart TD
    A[Git Push (content-v2/)] --> B[GitHub Actions Runner]
    B --> C{Content Validation}
    C -->|Fails| D[Pipeline Halts]
    C -->|Passes| E[Generate manifest.json & tar.gz]
    E --> F[AWS OIDC Authentication]
    
    F --> G{Branch?}
    G -->|main| H[AWS S3: labops-content-prod]
    G -->|dev| I[AWS S3: labops-content-dev]
    
    H --> J[Webhook to Worker (/api/v1/internal/sync)]
    I --> J
    
    J --> K[Worker Downloads S3 Content]
    K --> L[(Firestore Database)]
```

## 1. The Source of Truth
The `content-v2/` directory is the absolute source of truth for all curriculum structure and text. It contains:
- `index.json`: The global course catalog.
- `courses/{id}/course.yaml`: High-level course metadata.
- `modules/{id}/module.yaml`: Module progression.
- `labs/{id}/lab.yaml`: The exact task list, environment configurations, validation scripts, and initial container setups.

## 2. GitHub Actions Pipeline (CI/CD)
Whenever a push or merge happens on the `main` or `dev` branches, a GitHub Action runner initializes the deployment pipeline:

### Step 1: Content Validation
The CI runner executes the content validation scripts (`scripts/validate_content.py`). This strictly checks:
- Proper YAML formatting.
- Valid nested directory structure matching the `modules/` list.
- Valid markdown parsing.
- Existence of all required schema fields (e.g. `setup` arrays, `validation.command` presence).

### Step 2: Artifact Generation
If validation passes, the runner aggregates all the individual YAML/Markdown files into a single, cohesive `manifest.json`. It also packages the raw static assets into a `content.tar.gz`.

### Step 3: AWS OIDC Login
Using `aws-actions/configure-aws-credentials`, the runner authenticates directly with AWS using short-lived OIDC tokens. No static, long-lived access keys are ever stored in GitHub Secrets.

### Step 4: S3 Sync
Depending on the branch (`dev` or `main`), the pipeline pushes the artifacts to the respective environment bucket:
- `aws s3 sync ./dist s3://labops-content-dev/published/{version}/`

## 3. The Webhook & Worker Synchronization
While the S3 bucket acts as the canonical raw storage (serving the Next.js frontend via direct bootstrap), the platform's backend requires course metadata to be indexed in Firestore (to handle user enrollment and progress tracking).

Once the S3 upload successfully completes, the GitHub Action runner executes a standard `cURL` POST request to the hosted Worker service webhook endpoint:
```bash
curl -X POST https://worker.labops.com/api/v1/internal/sync-content \
     -H "Authorization: Bearer ${{ secrets.WORKER_SYNC_SECRET }}"
```

### The Worker's Role
Upon receiving the webhook, the Worker:
1. Reaches out to the AWS S3 bucket.
2. Downloads the newly uploaded `manifest.json`.
3. Performs a diff and seamlessly syncs the updated structural metadata (courses, modules, chapters, labs) directly into the Firestore database using the Firebase Admin SDK.
4. Once completed, the new content becomes instantly discoverable on the Dashboard catalog.

## Local Development (Floci)
During local development, this entire cloud pipeline is bypassed. The `docker-compose.local.yml` spins up `floci/floci` to emulate S3, and the `scripts/publish_local.py` replicates the CI runner's behavior, allowing curriculum authors to preview their content instantly without an internet connection.
