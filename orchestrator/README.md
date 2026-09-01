# Orchestrator

The orchestrator is a FastAPI service that manages lab containers. It is a **dumb container executor** — it spins up Sysbox containers, runs commands inside them, provides a WebSocket terminal, and handles lifecycle.

> **The orchestrator never reads `lab.yaml`.** The frontend owns the learning flow. The orchestrator only executes commands the frontend sends.

## What the Orchestrator Does

| Responsibility | How |
|----------------|-----|
| Start a container | `docker run labops-{type}` (base image per course type) |
| Run arbitrary commands | `POST /labs/{id}/exec` (frontend sends the command) |
| Provide terminal | WebSocket ↔ `docker exec /bin/bash -l` |
| Stop/Resume/Destroy | `docker stop` / `docker start` / `docker rm -f` |
| Auto-cleanup | Background checker destroys labs after 40 minutes |

## What the Orchestrator Does NOT Do

- Read `lab.yaml` — the frontend does
- Know what course is running — it only sees commands
- Serve course content — the backend owns that
- Make learning decisions — the frontend's wizard does
- Track user progress — the backend handles that via Firestore

## Current State

This orchestrator was merged from the standalone `SGP_v_docker_labs` project. It is now a **labs-only executor**:

- Manages lab containers (start/stop/resume/destroy)
- Executes commands inside containers (`POST /labs/{id}/exec`)
- Provides WebSocket terminal for xterm.js
- Serves lab.yaml schema for course authors
- Runs legacy validator.sh (`POST /labs/{id}/validate`)

**Content serving was removed in Phase 3.** The backend serves all content via `ContentProvider`.

## Target Direction

The orchestrator will remain a dumb executor. Changes coming:

1. **exec becomes the validation path** — Frontend sends task validation commands via exec, compares output locally
2. **Remove legacy validate endpoint** — Replaced by frontend-driven exec + comparison
3. **Backend proxies lab calls** — Backend calls orchestrator for lab lifecycle instead of frontend calling directly

---

## API Contract

Base URL: `http://localhost:8001`

All request/response bodies are JSON (`Content-Type: application/json`).

---

### Health

#### `GET /health`

Check if the orchestrator can reach the Docker daemon.

**Response `200`:**
```json
{
  "status": "ok",
  "docker": "connected",
  "server_version": "24.0.7"
}
```

---

### Lab Lifecycle

#### `POST /labs` — Start a lab

The backend calls this endpoint with the environment config the **client**
supplied in its start request (image, apt_packages, pre_pull, setup). The
backend never reads lab.yaml; the frontend does not call this directly.

**Request:**
```json
{
  "lab_id": "lab-1",
  "image": "labops-docker:latest",
  "user_id": "uid-123",
  "course_id": "linux-fundamentals",
  "apt_packages": ["docker.io"],
  "pre_pull": ["nginx:alpine"]
}
```

The container is labelled with `com.labops.user_id`, `com.labops.course_id` and `com.labops.lab_id` so sessions can be recovered by label (see `GET /labs/by_key`).

**Response `200`:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "lab_type": "custom",
  "lab_id": "lab-1",
  "container_id": "f6e5d4c3b2a1",
  "container_name": "labops-lab-a1b2c3d4e5f6",
  "status": "running",
  "created_at": "2026-07-12T10:30:00+00:00",
  "user_id": ""
}
```

#### `GET /labs` — List all labs

Returns all lab containers managed by the orchestrator.

#### `GET /labs/by_key?user_id=&lab_id=` — Recover a session

Returns the live `LabSession` for a user+lab by querying Docker labels (source of truth after a restart), or `404` if no labelled container exists.

#### `GET /labs/{session_id}` — Get session info

#### `POST /labs/{session_id}/activate` — Switch lab

Switches the active lab inside an existing container (swaps symlinks).

**Request:**
```json
{ "lab_id": "lab-3" }
```

#### `POST /labs/{session_id}/stop` — Stop lab

Stops the container without removing it.

#### `POST /labs/{session_id}/resume` — Resume lab

Restarts a stopped container.

#### `DELETE /labs/{session_id}` — Destroy lab

Force stops and removes the container.

---

### Command Execution

#### `POST /labs/{session_id}/exec` — Run a command

The primary endpoint for frontend-driven validation.

**Request:**
```json
{
  "command": "docker images -q | wc -l",
  "user": "student"
}
```

**Response `200`:**
```json
{
  "command": "docker images -q | wc -l",
  "exit_code": 0,
  "output": "2"
}
```

**Frontend-side validation (direct — no backend):**
```
1. Frontend reads the task spec from its local lab config
2. Sends the validation command to POST /labs/{session_id}/exec with { command, user }
3. Orchestrator runs the command and returns { exit_code, output }
4. Frontend compares output to task.validation.expected_output ("2") client-side
5. Uses match_type (contains/exact/regex) or expected_exit_code for comparison
6. Pass → unlock next task. Fail → show error_message.
```

---

### Validation (Legacy)

#### `POST /labs/{session_id}/validate` — Run validator.sh

Executes `/usr/local/checks/validator.sh` inside the container. Returns pass/fail JSON with individual test results. This endpoint will be replaced by frontend-driven exec validation.

---

### File Inspection

#### `POST /labs/{session_id}/inspect` — Check files

**Request:**
```json
{ "path": "/etc/passwd", "check": "contains" }
```

Check types: `exists`, `permissions`, `owner`, `contains`

---

### WebSocket Terminal

#### `WS /ws/terminal`

Opens an interactive terminal session into the lab container.

**Auth:** the token (a shared-secret JSON — `ORCHESTRATOR_SECRET` + session id) is sent as the **first message** — `{"type":"auth","token":...}` — never in the URL. The browser connects here **directly**: the frontend builds `ws(s)://<NEXT_PUBLIC_ORCHESTRATOR_URL>/ws/terminal` — there is no backend proxy in the path.

**Protocol:** Raw UTF-8/binary frames in both directions (no JSON framing), except the auth handshake and optional `{"type":"resize","cols":N,"rows":N}` frames.

```javascript
const ws = new WebSocket("ws://localhost:8001/ws/terminal");
ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: jwt }));
ws.onmessage = (event) => term.write(event.data);
term.onData((data) => ws.send(data));
```

---

### Session Source of Truth

#### `GET /labs/by_key?user_id=&lab_id=`

The orchestrator is the source of truth for lab sessions. Containers are labelled at creation:

| Label | Value |
|-------|-------|
| `com.labops.user_id` | student UID |
| `com.labops.course_id` | course id |
| `com.labops.lab_id` | lab id |

`GET /labs/by_key` queries Docker by those labels and returns the live `LabSession` (or `404`). The backend uses this as a read-through cache in front of `start`, so a restart never leaves zombie containers or duplicate sessions behind.

---

### Schemas

#### `GET /schemas/yaml` — JSON Schema for lab.yaml
#### `GET /schemas/sample` — Downloadable sample lab.yaml

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket path |
| `LAB_PREFIX` | `labops-lab` | Container name prefix |
| `LAB_TIMEOUT_MINUTES` | `40` | Auto-destroy timeout (minutes) |
| `CONTAINER_RUNTIME_MODE` | `sysbox` | Runtime mode: `sysbox` (default, sysbox-runc) or `standard`/`privileged`/`dev` (privileged=True for Docker Desktop on Windows/macOS) |

---

## Lab Container Runtime

All lab containers run with the **Sysbox** runtime (`sysbox-runc`) for Docker-in-Docker support.

| Property | Value |
|----------|-------|
| Base | Ubuntu 22.04 |
| Init | systemd (PID 1) |
| User | `student` (UID 1000), passwordless sudo |
| Runtime | `sysbox-runc` |
| Timeout | 40 minutes (configurable) |

---

## Local Development

### Running in the Vagrant VM (the default dev path)

The orchestrator runs as the **`labops-orchestrator` systemd service** on the VM
host — a host process, not a container — so the VM's Docker daemon stays
reserved for lab containers. `provisioning/install-orchestrator.sh` seeds:

| What | Where |
|------|-------|
| Source (Vagrant synced folder) | `/opt/sgp/orchestrator` |
| Python venv (**outside** the synced folder) | `/opt/sgp/venv-orchestrator` |
| Env (systemd `EnvironmentFile`) | `/opt/sgp/orchestrator.env` |
| Unit | `/etc/systemd/system/labops-orchestrator.service` |

It runs `uvicorn --reload`, so edits to `./orchestrator` hot-reload in the VM.
Operate it via `vagrant ssh`:

```bash
systemctl status labops-orchestrator       # status
journalctl -fu labops-orchestrator         # live logs
sudo systemctl restart labops-orchestrator # apply env/config changes
```

### Running in the dev compose stack (no Vagrant)

`docker-compose.dev.yml` ships an `orchestrator` service for a containerized
dev path (Docker Desktop / Linux) — useful when you don't want the VM:

```bash
docker compose -f docker-compose.dev.yml --env-file environments/dev/.env.dev up -d orchestrator
```

It builds the **`runtime`** Dockerfile stage (`ORCHESTRATOR_TARGET=runtime`) and
runs it **privileged** with the host Docker socket mounted, so the orchestrator
can create lab containers on the host daemon. Because Sysbox (`sysbox-runc`) is
**not** available on a plain Docker daemon, it forces
`CONTAINER_RUNTIME_MODE=privileged` (standard runc + `privileged=True`), which
is the Docker Desktop–compatible mode.

Prerequisites / notes:

- **Lab base images must be pre-built on the host daemon** the orchestrator
  talks to (§ *Building base images*): `labops-ubuntu:latest` and
  `labops-docker-fundamentals:latest`. Without them, `POST /labs` fails with
  `Image 'labops-...' not found`.
- Listens on host **`:8001`** (container `:8000`) — matches the frontend's
  default `NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:8001`.
- `ORCHESTRATOR_SECRET` defaults to `local-dev-super-secret`, matching the
  frontend default. No source mount + no `--reload` in runtime mode — restart
  the container after code changes (`docker compose restart orchestrator`).
- If the mounted Docker socket isn't readable by the image's `orchestrator`
  user (GID 999 ≠ host `docker` GID), add `user: root` to the service.

### Running natively on any Linux box (no Vagrant)

```bash
cd orchestrator
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Set `ORCHESTRATOR_SECRET` (must match the frontend's
`NEXT_PUBLIC_ORCHESTRATOR_SECRET`; the compose default is
`local-dev-super-secret`) and any `LAB_*`/`DEMO_*`/`DOCKER_HOST`
overrides as env vars (there is no dotenv loader — see `app/config.py`).

### Building base images

Lab containers run on Sysbox-compatible base images. Build them first:

```bash
cd orchestrator/lab-images
docker build -t labops-ubuntu:latest -f Dockerfile.ubuntu .
docker build -t labops-docker:latest -f Dockerfile.docker .
```

Or from the repo root:

```bash
docker build -t labops-ubuntu:latest -f orchestrator/lab-images/Dockerfile.ubuntu orchestrator/lab-images
docker build -t labops-docker:latest -f orchestrator/lab-images/Dockerfile.docker orchestrator/lab-images
```

**Important:** Images are pulled by the orchestrator at `docker run` time, so a
rebuilt image only affects lab containers **created after** the rebuild —
existing running containers keep their old image. Rebuild inside the VM, then
(re)start a lab to verify:

```bash
vagrant ssh -c 'cd /opt/sgp/orchestrator/lab-images && docker build -t labops-ubuntu:latest -f Dockerfile.ubuntu . && docker build -t labops-docker:latest -f Dockerfile.docker .'
```

The orchestrator service itself does not need a restart for image changes; only
a `sudo systemctl restart labops-orchestrator` (via the VM) when you change the
the orchestrator's env/config.

All images use `ENTRYPOINT ["/sbin/init"]` for systemd as PID 1.

There are only **2 base images**:

| Image | Contents | Used by |
|-------|----------|---------|
| `labops-ubuntu:latest` | Ubuntu 22.04 + systemd + `student` user + sudo + tmux + common tools (git, curl, vim) | git-fundamentals, linux-fundamentals |
| `labops-docker-fundamentals:latest` | Extends ubuntu + Docker CE from official Docker repo, pre-loaded with images | docker-mastery module 1 |

Additional packages (e.g. `git`, `vim`, `curl`) can be installed at runtime via the lab YAML's `environment.apt_packages` field, so most courses can use `labops-ubuntu` without a custom image.

---

## Project Structure

```
orchestrator/
├── lab-images/                    # Base image Dockerfiles
│   ├── Dockerfile.ubuntu          # labops-ubuntu: systemd + student user
│   └── Dockerfile.docker          # labops-docker: + Docker daemon (DinD)
├── app/
│   ├── main.py                 # FastAPI app, lifespan, CORS
│   ├── config.py               # Environment variables
│   ├── api/
│   │   ├── labs.py             # POST /labs, exec, validate, inspect
│   │   ├── health.py           # GET /health
│   │   └── schemas.py          # GET /schemas/yaml, /schemas/sample
│   ├── services/
│   │   └── docker_service.py   # Docker SDK wrapper
│   ├── models/
│   │   └── session.py          # LabSession, LabStatus
│   └── websocket/
│       └── terminal.py         # WS /ws/terminal (JWT handshake)
├── schemas/
│   ├── lab-schema.json         # JSON Schema for lab.yaml
│   ├── lab-sample.yaml         # Working example
│   └── README.md               # Course author guide
├── Dockerfile
├── requirements.txt
├── README.md                   # This file
├── TEST_API.md                 # curl/Postman test cases
└── postman_collection.json     # Importable Postman collection
```
