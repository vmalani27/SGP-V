# Why We Build Our Own CI/CD Infrastructure

> This document is not a technical architecture reference.  
> It explains the reasoning — why this project is built the way it is, and why that matters beyond just making it work.

---

## The easy path exists. We didn't take it.

GitHub-hosted runners are free for public repositories. You could push a commit, let GitHub spin up an Ubuntu VM, run `docker build`, push to Docker Hub, and be done in five minutes. No AWS account, no IAM, no infrastructure.

That is not the point.

---

## What building your own runner teaches you

### 1. You learn what "CI/CD" actually is, not just what it does

Most engineers who use GitHub Actions have never thought about what happens between `git push` and the green checkmark. A runner is a machine listening for a job. When one arrives, it pulls your repo, runs your steps, and reports back. That's it.

When you build your own:
- You control the machine image — you understand why runner containers exist as Docker images
- You provision it on-demand — you understand ephemeral compute and why cold start matters
- You register it — you understand the token flow between GitHub and the execution environment
- You deregister it — you understand why zombie runners are a real problem

None of this knowledge comes from using the hosted offering.

---

### 2. You understand daemonless builds

Docker, run normally, requires a daemon (`dockerd`) — a root process managing all container operations on a host. On a shared, unprivileged Fargate container, that daemon cannot run.

Kaniko is the answer, but it forces you to understand *why*: it reimplements Docker's build logic without a daemon, running entirely in userspace, building layers by chroot-ing into a snapshot of the filesystem. When you debug a `text file busy` error because Kaniko tried to overwrite the executor binary it was running, you've just learned something about how Linux handles running executables that most engineers never encounter.

You don't learn this from `docker buildx build`.

---

### 3. You confront the real cost of "free"

Docker Hub free tier rate-limits unauthenticated pulls to 100 per 6 hours per IP. A Fargate cold start pulls a base image. At scale, your builds fail with `429 Too Many Requests` from a third-party service you have no contract with.

The solution — ECR pull-through cache — requires you to understand:
- Where your base images actually come from
- What "pull-through" means as a caching strategy
- That you can own this path end-to-end

GitHub's hosted runners solve this silently by maintaining their own image cache. You never see the problem, so you never learn to own the solution.

---

### 4. You learn network topology by being forced to care

When your runner is in a VPC and your registry is ECR, the naive path is: runner → public internet → ECR. This works. It also means:
- Egress costs on every layer push
- Dependency on NAT gateway or public subnet assignment
- Builds that fail if the task has no public IP

The better path — VPC endpoints — routes traffic through AWS's private network. Building this forces you to understand:
- The difference between Interface endpoints and Gateway endpoints
- Why ECR needs two separate endpoints (`ecr.api` and `ecr.dkr`) even though it's one service
- Why S3 is involved at all (ECR stores layers in S3 under the hood)

This is the kind of knowledge that separates engineers who configure AWS from engineers who understand it.

---

### 5. Security is not an add-on

When you use GitHub-hosted runners, secrets are injected by GitHub. When you build your own:
- You decide where secrets live (SSM Parameter Store, not plaintext env vars)
- You decide how they're accessed (IAM role on the task, not hardcoded credentials)
- You decide who can trigger a runner (webhook HMAC verification, not an open API endpoint)
- You decide what the runner can do (scoped IAM policy, not `AdministratorAccess`)

Each of these is a decision. Making decisions requires understanding the threat model. Using managed services hides the decisions so you never have to make them — and never have to understand why they matter.

---

## Why this matters for LabOps specifically

LabOps is a platform for teaching DevOps. The content we deliver — labs on Docker, containers, CI/CD — is only credible if the infrastructure running the platform embodies those same principles.

A CI/CD pipeline that runs on GitHub's managed infrastructure, pushes to Docker Hub, and has no meaningful access control is not the foundation of a platform that teaches production-grade DevOps.

The pipeline we're building:
- Uses OIDC instead of long-lived AWS credentials
- Uses ephemeral runners instead of persistent, shared execution environments
- Uses ECR instead of Docker Hub for supply chain control
- Uses Kaniko instead of Docker-in-Docker because we don't have a privileged daemon
- Uses SSM instead of plaintext secrets

Every one of these choices is a lesson. The pipeline itself is part of the curriculum.

---

## What we're not claiming

This is not the cheapest way to do this. VPC endpoints cost money. Lambda + API Gateway adds complexity. Building your own runner image adds maintenance surface.

If the goal were simply to publish container images, we would use GitHub-hosted runners and Docker Hub and call it done.

The goal is to understand what we're doing well enough to teach it, defend the choices, and operate it when something breaks at 2am.

That requires having built it.
