# LabOps Curriculum Status & Roadmap

This document outlines the current production readiness of all interactive courses on the LabOps platform, as well as the planned roadmap for upcoming infrastructure courses.

---

## 1. Platform & Engine Readiness

The core learning runtime and deployment pipelines are fully implemented and running:

| Component | Architecture / Hosting | Status | Notes |
| :--- | :--- | :---: | :--- |
| **LabOps Orchestrator** | Python FastAPI service | **100% Operational** | Container lifecycle, port allocation, shared secret authentication (HTTP & WS handshake), health monitoring. |
| **Student Web UI** | Next.js 14 + Tailwind CSS | **100% Operational** | Interactive split terminal, task progress tracking, MCQ validation, dark theme. |
| **Content Sync Sidecar** | Go daemon (`sidecars/content-sync`) | **100% Operational** | Dual-mode: S3/CloudFront CDN edge polling (production) & Floci S3 fallback (local dev). |
| **CLI Distribution** | Go cross-compiled binaries | **100% Operational** | Multi-OS binaries (Linux/Win) compiled via GitHub Actions and served via S3 + CloudFront CDN. |
| **Lab Runner Images** | Ubuntu 22.04 base on AWS ECR | **100% Operational** | Pre-seeded user environment (`student`), passwordless sudo, systemd support, pre-configured Git/Docker. |
| **CI/CD Automation** | GitHub Actions workflows | **100% Operational** | Automated content validation, tarball packaging, image building, and CDN cache invalidation. |

---

## 2. Active Curriculum Status

### A. Git Fundamentals (`git-fundamentals`)
* **Total Chapters:** 12 / 12 (100% Written)
* **Total Labs:** 9 / 12 (75% Complete; 3 skeleton labs pending implementation)

| Module | Chapters | Labs | Tasks / Topics Covered | Status |
| :--- | :---: | :---: | :--- | :---: |
| **Module 1: Git Basics** | 5 / 5 | 5 / 5 | `init`, `config`, staging area, `diff`, `log`, atomic commits, hunk staging (`git add -p`), `.gitignore` | **Complete** (100%) |
| **Module 2: Branching & History** | 3 / 3 | 3 / 3 | Leaked secrets remediation (`git reset`, `push --force`), branching (`git switch -c`), fast-forward & 3-way merge conflict resolution | **Complete** (100%) |
| **Module 3: Remote & Collaboration** | 3 / 3 | 1 / 3 | Remotes (`git remote`), stash management (`git stash`), history inspection (`git log -p`, `git show`) | **In Progress** (Lab 10 complete; Labs 9 & 11 pending) |
| **Module 4: Complete Workflow** | 1 / 1 | 0 / 1 | End-to-end pull request & feature branch delivery lifecycle | **In Progress** (Chapter 12 complete; Lab 12 pending) |

---

### B. Docker Mastery (`docker-mastery`)
* **Total Chapters:** 15 / 15 (100% Written)
* **Total Labs:** 15 / 15 (100% Complete with interactive validations)

| Module | Chapters | Labs | Tasks / Topics Covered | Status |
| :--- | :---: | :---: | :--- | :---: |
| **Module 1: Docker Fundamentals** | 4 / 4 | 4 / 4 | Socket permissions, image cache inspection, running containers, detached mode, port mapping, cleanup | **Complete** (100%) |
| **Module 2: Building Custom Images** | 6 / 6 | 7 / 7 | Dockerfiles, layer caching, `COPY` vs `ADD`, entrypoint vs cmd, multi-stage compilation builds, image slimming | **Complete** (100%) |
| **Module 3: Container Networking** | 2 / 2 | 2 / 2 | User-defined bridge networks, DNS service discovery, inter-container communication, port exposure | **Complete** (100%) |
| **Module 4: Persistent Storage** | 2 / 2 | 2 / 2 | Volume drivers, bind mounts, permissions management, data backup and lifecycle retention | **Complete** (100%) |

---

## 3. Curriculum Roadmap & Planned Courses

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CURRICULUM ROADMAP                                │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ Q4 2026 / Active Delivery     │ 1. Git Fundamentals (Finalize Labs 9, 11, 12)│
│                               │ 2. Docker Mastery (Production Polish)       │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ Next Release: Systems Track   │ Linux System Administration (Ubuntu & RHEL) │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ Follow-up: DevOps Track       │ CI/CD Engineering (GitHub Actions & GitLab) │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

---

### Planned Course 1: Linux System Administration (`linux-admin`)
* **Target Audience:** Developers, DevOps Engineers, and System Administrators.
* **Environments:** Dual-distro containers (Ubuntu 22.04 LTS & RHEL 9 / Rocky Linux).

| Module | Proposed Topics | Hands-on Lab Concepts |
| :--- | :--- | :--- |
| **1. Shell Navigation & Core CLI** | Streams (`stdin`/`stdout`/`stderr`), pipes, redirection, search (`find`, `grep`, `awk`, `sed`), text manipulation | Troubleshooting log streams and filtering server metrics |
| **2. Permissions, Ownership & Security** | POSIX permissions (`chmod`, `chown`, `umask`), SUID/SGID, sticky bit, `sudoers` least-privilege configuration | Hardening multi-user directories and securing deployer accounts |
| **3. Process Lifecycle & Systemd** | Process signals (`SIGTERM`, `SIGKILL`), background jobs, writing custom systemd service units, `journalctl` | Diagnosing crashed background daemons and configuring auto-restart |
| **4. Dual Package Management** | Debian/Ubuntu (`apt`, `dpkg`) vs Enterprise Linux (`dnf`, `rpm`), repo sources, dependency troubleshooting | Installing, pinning, and updating packages cleanly across both distros |
| **5. Storage, LVM & Filesystems** | Partitions, LVM (PV, VG, LV), formatting (`ext4`/`xfs`), mount options, `/etc/fstab` persistence | Expanding live logical volumes and repairing broken mount tables |
| **6. Networking & Firewall Security** | IP routing, DNS diagnostics (`ss`, `dig`, `curl`), `ufw` (Ubuntu) & `firewalld` (RHEL), SSH key hardening | Locking down public servers and configuring port forwarding |

---

### Planned Course 2: CI/CD Pipeline Engineering (`cicd-engineering`)
* **Target Audience:** Software engineers, platform engineers, and DevOps practitioners.
* **Platforms Covered:** GitHub Actions & GitLab CI/CD.

| Module | Proposed Topics | Hands-on Lab Concepts |
| :--- | :--- | :--- |
| **1. CI/CD Core Philosophy** | Continuous Integration vs Continuous Delivery vs Continuous Deployment, pipeline anatomy, triggers | Designing a fast feedback test loop for a web service |
| **2. GitHub Actions Fundamentals** | Workflows, jobs, steps, context variables, matrix testing strategies, artifact handling | Building a multi-node matrix test suite for Python & Go |
| **3. Production GitHub Actions** | Environment approvals, Secrets Management, OIDC trust with AWS (passwordless auth), reusable workflows | Publishing OCI images to ECR and deploying to AWS without static keys |
| **4. GitLab CI/CD Core** | `.gitlab-ci.yml` architecture, stages, jobs, artifacts vs cache, variable hierarchies | Building and caching dependencies across pipeline runs |
| **5. Enterprise GitLab CI/CD** | GitLab Runners (shell, docker, kubernetes), rules & conditional execution, dynamic child pipelines | Setting up a secure runner and implementing branch gate rules |
| **6. Complete Release Pipelines** | Automated semantic versioning (`semver`), changelog generation, vulnerability scanning (Trivy), rollback gates | Building an end-to-end commit-to-production container release pipeline |
