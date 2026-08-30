# Deployment Guide

The current setup utilizes `docker compose` and a Vagrant VM to ensure a frictionless local development experience. However, when moving LabOps to a production environment, the deployment strategy changes to ensure scalability, security, and performance.

This guide outlines the path from local development to production deployment.

## 1. The Orchestrator (Sysbox Host)

In local development, the orchestrator runs inside a Vagrant Ubuntu 22.04 VM. In production, you do **not** use Vagrant.

### Production Strategy: Bare-Metal or Nested-Virtualization Cloud Instances
Because Sysbox relies on specific Linux kernel features and user namespaces to provide true isolation, you must deploy the Orchestrator API on a Linux host that supports these requirements.

- **Option A: Bare-Metal Servers:** Dedicated Linux servers (e.g., Ubuntu 22.04) running the Sysbox runtime directly. This provides the best performance for I/O heavy Docker-in-Docker workloads.
- **Option B: Cloud Instances (Nested Virtualization):** Instances like AWS EC2 `.metal` or GCP instances with nested virtualization enabled. Standard VMs often strip the virtualization extensions needed by some Sysbox workloads, though basic unprivileged containers work on standard Ubuntu AMIs.

**Deployment Steps:**
1. Provision an Ubuntu 22.04 host.
2. Install Docker Engine and the Sysbox runtime (see Sysbox documentation).
3. Run the FastAPI `orchestrator` service as a standard systemd service or inside a standard Docker container that has access to the host's Docker socket (to spin up the Sysbox sibling containers).
4. Secure the API: Student browsers talk to the orchestrator **directly** (REST lifecycle + `ws/wss://…/ws/terminal`), so it cannot be hidden behind the backend. Give it its own internal hostname, serve it only over HTTPS, and firewall off everything except the front route. The browser ships `NEXT_PUBLIC_ORCHESTRATOR_URL` and `NEXT_PUBLIC_ORCHESTRATOR_SECRET`, so the current static shared secret is a dev-only credential — for production, move terminal/session auth to short-lived, per-session tokens issued by the backend.

## 2. The Backend, Frontend, and Worker

These are standard stateless microservices and can be deployed to any modern container orchestration platform.

### Production Strategy: Managed Container Services
- **AWS ECS (Fargate) / GCP Cloud Run / Kubernetes:** Deploy the `backend`, `frontend`, and `worker` Docker images.
- **Scaling:** The `backend` is strictly stateless (relying solely on Firestore) and can be scaled horizontally; it carries no WebSockets and never talks to the orchestrator. The **orchestrator** is the component that opens long-lived `ws/wss` connections to browsers (plus per-lab terminal) — size it for your concurrent-lab peak and give it its own route + session timeouts.

## 3. Infrastructure & Dependencies

### Firebase
- Transition from local emulators (if used) to a real Firebase production project.
- Secure Firestore with robust Security Rules, ensuring students can only write to their specific enrollment documents (`taskResults`).

### S3 & CloudFront
- Replace local `floci`/`localstack` with a real AWS S3 Bucket.
- **CDN:** Place Amazon CloudFront (or similar CDN) in front of the S3 bucket. The `next-app` frontend downloads content artifacts (`.tar.gz`) directly to the browser. A CDN is critical to ensure fast course bootstrapping for students globally and to reduce egress costs.

## 4. Security Considerations

1. **Orchestrator Network:** The Sysbox containers (`sgp-lab-*`) spawned by the orchestrator should be placed on an isolated Docker bridge network without routing access to your internal cloud VPC metadata endpoints (e.g., AWS IMDS `169.254.169.254`), preventing student containers from stealing cloud IAM roles.
2. **Orchestrator secret / terminal tokens:** dev uses a static shared
   `ORCHESTRATOR_SECRET` that the browser holds (`NEXT_PUBLIC_ORCHESTRATOR_SECRET`)
   — acceptable locally, but in production replace the static secret with
   short-lived per-session tokens issued on lab start, delivered via a secret
   manager (not baked into the client build).
3. **Resource Limits:** In production, you must enforce CPU, Memory, and PIDs limits on the Sysbox containers via the orchestrator to prevent a single student from Fork-Bombing and exhausting the host server's resources.
