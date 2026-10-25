# Fargate Ephemeral Runner — Implementation Plan
> **Last updated:** September 2026  
> **Status:** In-progress — runner container built and validated  
> **Reference:** See [`docs/4-deployment/why-self-hosted-runners.md`](../../docs/4-deployment/why-self-hosted-runners.md) for the rationale.

---

## What We're Building

An event-driven, zero-idle CI/CD pipeline where every GitHub Actions job spins up a fresh Fargate container on-demand, builds container images using **Kaniko** (daemonless), pushes to **Amazon ECR Public**, and destroys itself — no long-running runner, no shared state, no Docker socket.

---

## System Diagram

```
GitHub Push / workflow_dispatch
        │
        │  workflow_job.queued (webhook)
        ▼
API Gateway (HTTP API)
        │
        ▼
Lambda — webhook validator + dispatcher
        │  1. Verify HMAC-SHA256 signature (GitHub webhook secret)
        │  2. Check DynamoDB: skip if job.id already seen
        │  3. Write job.id to DynamoDB (TTL: 1h)
        │  4. Call ecs:RunTask → launch Fargate task
        ▼
Fargate Task (labops-runner container)
        │  entrypoint.sh:
        │   - Fetch GITHUB_PAT from SSM Parameter Store (SecureString)
        │   - POST /orgs/{org}/actions/runners/registration-token
        │   - ./config.sh --ephemeral --url --token
        │   - ./run.sh   ← picks up the queued job
        │
        │  Job steps execute:
        │   - aws-actions/configure-aws-credentials (OIDC)
        │   - aws-actions/amazon-ecr-login (registry-type: public)
        │   - sudo /usr/local/kaniko/executor → build image
        │   - push via VPC endpoint → ECR (no public egress)
        │
        ▼
Runner self-deregisters (SIGTERM trap in entrypoint.sh)
Fargate reclaims task — cost stops immediately
```

---

## Components

### 1. Runner Container — `aws/runner/`

| File | Purpose |
|:-----|:--------|
| [`Dockerfile`](runner/Dockerfile) | Multi-stage Ubuntu 22.04 + Kaniko + GitHub Actions Runner |
| [`entrypoint.sh`](runner/entrypoint.sh) | Fetches PAT from SSM, registers ephemeral runner, traps SIGTERM |
| [`build-and-push.ps1`](runner/build-and-push.ps1) | Local build & push to ECR Private (`labops-base:runner-*`) |

**Key design decisions in Dockerfile:**
- Kaniko binaries live at `/usr/local/kaniko/` — **not** `/kaniko/`
  - Reason: when Kaniko builds *this* Dockerfile itself (the runner), it would try to overwrite `/kaniko/executor` while it's the running process → Linux `ETXTBSY` (text file busy) error
  - Symlink: `/kaniko/executor → /usr/local/kaniko/executor` for backwards compatibility
- `runner` user has passwordless `sudo` — Kaniko needs root to set file ownership during layer extraction
- Runner binary validated with SHA256 checksum at build time

```dockerfile
# Why not /kaniko directly:
COPY --from=kaniko-src /kaniko /usr/local/kaniko
RUN mkdir -p /kaniko && ln -sf /usr/local/kaniko/executor /kaniko/executor

# Kaniko runs via sudo to handle chown on layer files:
sudo /usr/local/kaniko/executor --context=... --dockerfile=... --destination=...
```

---

### 2. Lambda Dispatcher — `aws/lambda/` _(to build)_

**Runtime:** Python 3.12  
**IAM permissions needed:**
- `ecs:RunTask`
- `iam:PassRole` (for task execution role)
- `dynamodb:GetItem`, `dynamodb:PutItem`

**Core logic (~40 lines):**

```python
import hashlib, hmac, json, os, boto3

ecs = boto3.client('ecs')
ddb = boto3.resource('dynamodb').Table(os.environ['DEDUP_TABLE'])

def handler(event, context):
    # 1. Verify webhook signature
    body = event['body']
    sig = event['headers'].get('x-hub-signature-256', '')
    secret = os.environ['WEBHOOK_SECRET'].encode()
    expected = 'sha256=' + hmac.new(secret, body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return {'statusCode': 401, 'body': 'Unauthorized'}

    payload = json.loads(body)
    if payload.get('action') != 'queued':
        return {'statusCode': 200, 'body': 'ignored'}

    # 2. Dedup check
    job_id = str(payload['workflow_job']['id'])
    resp = ddb.get_item(Key={'job_id': job_id})
    if 'Item' in resp:
        return {'statusCode': 200, 'body': 'duplicate'}
    ddb.put_item(Item={'job_id': job_id, 'ttl': int(time.time()) + 3600})

    # 3. Launch runner task
    ecs.run_task(
        cluster=os.environ['ECS_CLUSTER'],
        taskDefinition=os.environ['TASK_DEF'],
        launchType='FARGATE',
        networkConfiguration={'awsvpcConfiguration': {
            'subnets': os.environ['SUBNETS'].split(','),
            'securityGroups': os.environ['SECURITY_GROUPS'].split(','),
            'assignPublicIp': 'DISABLED'
        }}
    )
    return {'statusCode': 200, 'body': 'runner launched'}
```

---

### 3. IAM Policy — `aws/policy/ecr-publish-policy-dev.json`

Already applied to `labops-role-dev`. Grants:
- `ecr-public:GetAuthorizationToken` + full image push for ECR Public
- `ecr:GetAuthorizationToken` + full image push for ECR Private
- `sts:GetServiceBearerToken` (required by ECR Public auth flow)
- `ssm:GetParameter` on `/labops/*` namespace

---

### 4. ECR Pull-Through Cache _(to configure)_

Prevents Docker Hub rate limiting on Fargate cold starts. Every `FROM python:3.11-slim` in built images currently hits Docker Hub directly.

**Setup (one-time, via AWS Console or CLI):**

```bash
# Create pull-through cache rule for Docker Hub
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub \
  --upstream-registry-url registry-1.docker.io \
  --region ap-south-1

# Then in Dockerfiles, replace:
#   FROM python:3.11-slim
# with:
#   FROM 586177432842.dkr.ecr.ap-south-1.amazonaws.com/dockerhub/python:3.11-slim
```

First pull → ECR fetches from Docker Hub and caches. Every subsequent pull → intra-AWS, no rate limits.

---

### 5. VPC Endpoints _(to configure)_

Routes all ECR traffic through AWS private network. Fargate tasks need `assignPublicIp: DISABLED`.

**Endpoints to create in your VPC:**

| Endpoint | Type | Purpose |
|:---------|:-----|:--------|
| `com.amazonaws.ap-south-1.ecr.api` | Interface | ECR API calls (auth, describe) |
| `com.amazonaws.ap-south-1.ecr.dkr` | Interface | Layer push/pull |
| `com.amazonaws.ap-south-1.s3` | Gateway | ECR stores layers in S3 (free) |
| `com.amazonaws.ap-south-1.ssm` | Interface | SSM Parameter Store access |

With these in place: build → Kaniko layer push → ECR never touches public internet. Egress cost: $0.

---

### 6. Secrets & Config

| Secret | Location | Access |
|:-------|:---------|:-------|
| `GITHUB_PAT` | SSM `/labops/github_pat` (SecureString) | Task execution role reads at container start |
| `WEBHOOK_SECRET` | Lambda env (or SSM) | Lambda reads to verify GitHub webhook HMAC |
| `AWS_ROLE_TO_ASSUME` | GitHub Actions secret | Used by `configure-aws-credentials` for OIDC |

**Never:**
- Hardcode PAT in task definition (shows in CloudFormation state, logs)
- Use a non-expiring plaintext env var for anything secret

---

## Build & Test Sequence

### Phase 1 — Done ✅
- [x] Runner `Dockerfile` with Kaniko at `/usr/local/kaniko/` (ETXTBSY fix)
- [x] Passwordless `sudo` for `runner` user
- [x] `entrypoint.sh` with SSM PAT fetch + SIGTERM deregistration
- [x] ECR IAM policy applied to `labops-role-dev`
- [x] `build-images.yml` updated to use `sudo /usr/local/kaniko/executor`

### Phase 2 — ECR Optimization
- [ ] Configure ECR pull-through cache for `docker.io`
- [ ] Add VPC endpoints: `ecr.api`, `ecr.dkr`, `s3` (gateway), `ssm`
- [ ] Update Fargate task definition: `assignPublicIp: DISABLED`

### Phase 3 — Event-Driven Provisioning
- [ ] Create DynamoDB table `labops-runner-dedup` (PK: `job_id`, TTL: `ttl`)
- [ ] Write Lambda (Python 3.12) — webhook validator + `ecs:RunTask` dispatcher
- [ ] Create API Gateway HTTP API → Lambda integration
- [ ] Register webhook in GitHub repo: `workflow_job` events only
- [ ] End-to-end smoke test: push to `dev` → webhook fires → Fargate runner picks up job → Kaniko builds → ECR push succeeds

### Phase 4 — GitHub App Migration _(later)_
- [ ] Create GitHub App with `actions:write` and `self-hosted-runners:write` permissions
- [ ] Update `entrypoint.sh`: JWT → installation token → registration token (same structure, different auth)
- [ ] Benefit: token expires in 1h, repo-scoped, not user-account-dependent

---

## Cost Estimate

| Component | Cost at ~100 builds/month |
|:----------|:--------------------------|
| Fargate (1 vCPU, 2GB, 3 min/build) | ~$0.05/month |
| Lambda invocations | ~$0.00 (free tier) |
| API Gateway | ~$0.00 (free tier) |
| DynamoDB | ~$0.00 (on-demand, minimal reads) |
| ECR storage (runner image ~600MB) | ~$0.06/month |
| VPC Interface endpoints | ~$7/month (2 endpoints × $0.01/hr) |

> The VPC endpoints have a fixed hourly cost. At low build volume, they're the dominant cost. They become worth it above ~500 builds/month or if egress charges accumulate.

---

## Quick Reference

```bash
# Build and push runner locally
cd aws/runner
.\build-and-push.ps1

# Test Kaniko build inside runner (from a running container shell)
sudo /usr/local/kaniko/executor \
  --context=/workspace \
  --dockerfile=/workspace/Dockerfile \
  --no-push

# Verify ECR login (ECR Public)
aws ecr-public get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin public.ecr.aws

# Check IAM policy on role
aws iam get-role-policy \
  --role-name labops-role-dev \
  --policy-name ecr-publish-policy-dev
```
