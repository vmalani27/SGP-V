# Setup Guide — SGP_V (LabOps)

This guide walks a new developer from a fresh clone to a running, editable
stack: Firebase credentials, local S3 (Floci), content publishing, the Docker
Compose stack, and the Vagrant orchestrator VM.

---

## 1. Prerequisites

| # | Requirement | Notes |
|---|-------------|-------|
| 1 | [Docker Engine](https://docs.docker.com/get-docker/) + Docker Compose v2 | `docker compose` (not `docker-compose`) |
| 2 | [Vagrant](https://developer.hashicorp.com/vagrant) + VirtualBox (or your provider) | Runs the orchestrator VM (Docker + Sysbox); the orchestrator runs there as a systemd service, not a container |
| 3 | AWS CLI | For publishing content to Floci (`aws`) |
| 4 | Python 3 + `pyyaml` | For the content validation/publish scripts |
| 5 | A **Firebase project** with Auth + Firestore enabled | Service-account JSON + Web API key (see §2) |

> **Sysbox** is required only inside the orchestrator VM (auto-provisioned by
> `vagrant up`), not on the host. See `orchestrator/README.md`.

---

## 2. Firebase credentials

You need **two** things from the same Firebase project.

### 2a. Service-account JSON (server-side: backend + worker)

1. [Firebase Console](https://console.firebase.google.com/) → your project →
   ⚙ Project Settings → **Service accounts** tab.
2. **Generate new private key** → downloads `your-project-firebase-adminsdk-....json`.
3. Save it as **`backend/app/core/credentials.json`**.

   This exact path is mounted into the worker container by docker-compose
   (`./backend/app/core/credentials.json:/app/credentials.json:ro`), so **one
   copy serves both the backend and the worker**.

   > Alternative: paste the whole JSON as a single line into
   > `FIREBASE_CREDENTIALS_JSON` (see §3).

### 2b. Web API config (client-side: frontend)

From Firebase Console → ⚙ Project Settings → **General** → *Your apps*,
copy the 6 public values. These are **not** secrets (baked into the browser
bundle); access is controlled by Firebase Security Rules.

Fill them into `next-app/.env.local` (see §3):

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIza...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `<project>-<suffix>` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `<project>.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `1...` numeric |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:...:web:...` |

---

## 3. Environment files

Sealed per-environment configs live in the repo-root `environments/` folder —
one env file per compose stack:

- `environments/local/.env.local`   → `docker-compose.local.yml` (Floci S3)
- `environments/dev/.env.dev`       → `docker-compose.dev.yml`   (real AWS)
- `environments/beta/.env.beta`     → `docker-compose.beta.yml`  (real AWS)

Each compose file interpolates `${VAR:-default}` from its env file via
`--env-file environments/<env>/.env.<env>` (the same file drives compose
interpolation and the container env). Service `.env` / `.env.local` files are
only used if you run a service **natively on the host** (outside Docker) — the
containers ignore them.

### 3a. Local env file — what docker compose injects (Floci)

Copy the template, then fill the Firebase vars:

```powershell
copy environments\local\.env.local.sample environments\local\.env.local
```

```bash
# ── Firebase (injected into backend + worker containers) ─────────────────
FIREBASE_PROJECT_ID=<your-project-id>
# Option A: leave blank and use backend/app/core/credentials.json mount
FIREBASE_CREDENTIALS_JSON=
# Option B: paste the full service-account JSON as one line
# FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}

# ── Orchestrator credential (backend does NOT use it anymore) ────────────
# The browser authenticates to the orchestrator directly with
# ORCHESTRATOR_SECRET (must match the orchestrator VM env + next-app's
# NEXT_PUBLIC_ORCHESTRATOR_SECRET; dev default local-dev-super-secret).
ORCHESTRATOR_SECRET=local-dev-super-secret

# ── Floci S3 (injected into worker container; these are already the
#    docker-compose.local.yml defaults) ───────────────────────────────────
# Worker reaches the floci service by compose-internal name.
AWS_ENDPOINT_URL=http://floci:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
```

The **dev/beta** env files instead carry the real S3 bucket + IAM creds and a
real `CONTENT_PUBLIC_BASE_URL` — switch to them (and their compose files) only
when you leave local development.

### 3b. Service `.env` files (native runs only)

Copy each sample and fill as needed:

```bash
cp backend/.env.sample  backend/.env
cp worker/.env.sample   worker/.env
cp orchestrator/.env.sample orchestrator/.env
cp next-app/.env.sample next-app/.env.local
```

- `worker/.env` → set `FIREBASE_PROJECT_ID`, `S3_BUCKET`.
- `orchestrator/.env` → set `ORCHESTRATOR_SECRET` (must match `next-app`'s `NEXT_PUBLIC_ORCHESTRATOR_SECRET`; provisioning seeds it from the host env into the VM).
- `next-app/.env.local` → set the 6 `NEXT_PUBLIC_FIREBASE_*` values (§2b).

> Troubleshooting tip: if the contents of `worker/.env` were created by blindly
> copying the sample (e.g. `FIREBASE_PROJECT_ID=worker/.env.sample`), fix it to
> the real project id. With docker-compose, the authoritative source is the
> **env file passed via `--env-file`** (`environments/local/.env.local` for the
> local stack), so keep both consistent.

---

## 4. Deploying Floci (S3 + Lambda) & Content

The local S3 (Floci) and the Content Sync Worker (AWS Lambda) run locally via LocalStack.
Instead of manually creating buckets or running a standalone worker service, we use a single automated deployment script that:
1. Creates the S3 bucket (`my-content-bucket`) in Floci.
2. Builds the Python Lambda function (and dependencies Layer) via Docker.
3. Deploys the Lambda to Floci and attaches S3 event notifications.
4. Validates the `content-v2` source, generates a manifest, and uploads it to S3, triggering the Lambda.

**On Windows:**
```powershell
scripts\local\deploy_floci_lambda.bat
```

> **Note**: This script uses `environments/dev/firebase/FIREBASE_CREDS_JSON_DEV.json` and injects it into the Lambda environment variables.

---

## 5. Start the stack

```powershell
# Docker Compose host stack (frontend + backend + floci)
docker compose -f docker-compose.local.yml up -d

# Orchestrator VM (Docker + Sysbox; builds lab images on first boot)
vagrant up
```

The orchestrator runs in the VM as the **`sgp-orchestrator` systemd service** (host process, not a container — the VM's Docker daemon is reserved for lab containers). Its env is seeded by `provisioning/install-orchestrator.sh` to `/opt/sgp/orchestrator.env`. Verify it came up:

```powershell
vagrant ssh -c 'systemctl status sgp-orchestrator'
curl http://localhost:8001/health   # {"status":"ok","docker":"connected",...}
```

**Health baseline — everything green before use:**

```powershell
curl http://localhost:8000/healthz                 # {"status":"ok"}
curl http://localhost:8000/api/v1/content/version  # {version, download_url, artifact_sha256}
```

Open the app: <http://localhost:3000>

---

## 6. Daily workflow — hot reload

The stack mounts source directly (`./backend:/app`, `./next-app:/app`) so edits hot-reload:

- **frontend**: Next.js dev server + `CHOKIDAR_USEPOLLING=true` → edit → save.
- **backend**: FastAPI + uvicorn `--reload`.
- **orchestrator**: `sgp-orchestrator` systemd service in the Vagrant VM.
- **content**: If you edit courses in `content-v2/`, just re-run `scripts\local\deploy_floci_lambda.bat` to sync them locally.

---

## FAQ / quick fixes

| Symptom | Fix |
|---------|-----|
| Next.js `500` error on lab load | Ensure you ran the `deploy_floci_lambda.bat` script after starting docker compose. If Floci restarts, its temporary S3 and Lambda state is wiped. |
| Orchestrator REST/WS auth fails | `ORCHESTRATOR_SECRET` must match the frontend's `NEXT_PUBLIC_ORCHESTRATOR_SECRET` and the orchestrator env (`/opt/sgp/orchestrator.env` in the VM) |
| Frontend login fails on cold clone | `environments/dev/frontend/.env.dev` needs the 6 `NEXT_PUBLIC_FIREBASE_*` values (§2b) |

