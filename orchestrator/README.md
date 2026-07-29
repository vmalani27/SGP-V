# Orchestrator

The orchestrator is a FastAPI service that manages lab containers. It is a **dumb container executor** — it spins up Sysbox containers, runs commands inside them, provides a WebSocket terminal, and handles lifecycle.

> **The orchestrator never reads `lab.yaml`.** The frontend owns the learning flow. The orchestrator only executes commands the frontend sends.

## What the Orchestrator Does

| Responsibility | How |
|----------------|-----|
| Start a container | `docker run sgp-lab-{type}` (base image per course type) |
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

The backend calls this endpoint with the environment config extracted from the lab YAML. The frontend does NOT call this directly.

**Request:**
```json
{
  "lab_id": "lab-1",
  "image": "sgp-lab-docker:latest",
  "apt_packages": ["docker.io"],
  "pre_pull": ["nginx:alpine"]
}
```

**Response `200`:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "lab_type": "custom",
  "lab_id": "lab-1",
  "container_id": "f6e5d4c3b2a1",
  "container_name": "sgp-lab-a1b2c3d4e5f6",
  "status": "running",
  "created_at": "2026-07-12T10:30:00+00:00",
  "user_id": ""
}
```

#### `GET /labs` — List all labs

Returns all lab containers managed by the orchestrator.

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

**Frontend validation flow:**
```
1. Frontend reads lab.yaml task
2. Sends POST /labs/{id}/exec { command: task.validation.command }
3. Gets back { output: "2" }
4. Compares output to task.validation.expected_output ("2")
5. Uses match_type (contains/exact/regex) for comparison
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

#### `WS /ws/{session_id}/terminal`

Opens an interactive terminal session into the lab container.

**Protocol:** Raw UTF-8 text frames in both directions (no JSON framing).

```javascript
const ws = new WebSocket("ws://localhost:8001/ws/" + sessionId + "/terminal");
ws.onmessage = (event) => term.write(event.data);
term.onData((data) => ws.send(data));
```

---

### Schemas

#### `GET /schemas/yaml` — JSON Schema for lab.yaml
#### `GET /schemas/sample` — Downloadable sample lab.yaml

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker socket path |
| `LAB_PREFIX` | `sgp-lab` | Container name prefix |
| `LAB_TIMEOUT_MINUTES` | `40` | Auto-destroy timeout (minutes) |

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

```bash
cd orchestrator
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Building base images

Lab containers run on Sysbox-compatible base images. Build them first:

```bash
cd orchestrator/lab-images
docker build -t sgp-lab-ubuntu:latest -f Dockerfile.ubuntu .
docker build -t sgp-lab-docker:latest -f Dockerfile.docker .
```

Or from the repo root:

```bash
docker build -t sgp-lab-ubuntu:latest -f orchestrator/lab-images/Dockerfile.ubuntu orchestrator/lab-images
docker build -t sgp-lab-docker:latest -f orchestrator/lab-images/Dockerfile.docker orchestrator/lab-images
```

**Important:** Images are pulled by the orchestrator at `docker run` time. If you modify a Dockerfile, you **must** rebuild the image and restart the stack for new lab containers to pick it up:

```bash
docker compose down
# rebuild the image(s) you changed (see commands above)
docker compose up -d
```

All images use `ENTRYPOINT ["/sbin/init"]` for systemd as PID 1.

There are only **2 base images**:

| Image | Contents | Used by |
|-------|----------|---------|
| `sgp-lab-ubuntu:latest` | Ubuntu 22.04 + systemd + `student` user + sudo + tmux + common tools (git, curl, vim) | git-fundamentals, linux-fundamentals |
| `sgp-lab-docker:latest` | Extends ubuntu + Docker CE from official Docker repo | docker-mastery (needs DinD) |

Additional packages (e.g. `git`, `vim`, `curl`) can be installed at runtime via the lab YAML's `environment.apt_packages` field, so most courses can use `sgp-lab-ubuntu` without a custom image.

---

## Project Structure

```
orchestrator/
├── lab-images/                    # Base image Dockerfiles
│   ├── Dockerfile.ubuntu          # sgp-lab-ubuntu: systemd + student user
│   └── Dockerfile.docker          # sgp-lab-docker: + Docker daemon (DinD)
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
│       └── terminal.py         # WS /ws/{id}/terminal
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
