# Orchestrator — Technical Deep Dive

The orchestrator is a FastAPI-based service that acts as the container control plane. It manages the complete lifecycle of lab environments, exposes a unified REST and WebSocket interface, and communicates with the host Docker Engine through the Docker SDK.

The orchestrator never communicates with Firebase or stores persistent user data. Its sole purpose is to manage containers. The backend handles auth, content serving, and progress tracking. The frontend drives the learning flow.

## Lab Lifecycle Management

When a student starts a lab from the frontend:

1. **Frontend** calls `POST /api/v1/labs/courses/{id}/labs/{labId}/start` on the **backend**, supplying the lab's environment config (`image`, `apt_packages`, `pre_pull`, `setup`) in the body from its local lab config
2. **Backend** (which never reads `lab.yaml`) forwards that config to `POST /labs` on the orchestrator
3. **Orchestrator** creates an isolated Sysbox container using the specified image with `sysbox-runc` runtime
4. **Orchestrator** installs `apt_packages` and pre-pulls Docker images as specified in the environment config

Lifecycle operations: `POST /labs/{id}/stop` (pause), `POST /labs/{id}/resume` (restart), `DELETE /labs/{id}` (force remove). Labs are ephemeral — all container resources are cleaned up on destroy.

A background checker destroys labs after 40 minutes (configurable via `LAB_TIMEOUT_MINUTES`).

## Terminal Management

The orchestrator provides an interactive Linux terminal via WebSocket at `WS /ws/terminal`. The JWT is sent as the **first message** (`{"type":"auth","token":...}`) — never in the URL. The browser does not connect here directly; the backend proxies it from `/api/v1/labs/ws/lab`. It uses aiodocker's async exec streaming to bridge stdin/stdout between the backend proxy and the container's bash shell. The student gets a bash session as the `student` user.

Sessions are recovered from Docker labels: containers are labelled `com.sgp.user_id`, `com.sgp.course_id` and `com.sgp.lab_id` at creation, and `GET /labs/by_key?user_id=&lab_id=` returns the live session after a restart.

## Validation System

Validation is **exec-based**. The orchestrator has no knowledge of tasks or expected answers:

1. The **frontend** reads the task definitions from its local content
   (`/api/local-content/labs/{courseId}/{labId}/tasks`), and supplies each
   task's `task_type` + `validation` spec to the backend
2. The student completes the task in the terminal
3. The student clicks "Check"
4. The **frontend** sends `POST /api/v1/labs/courses/{id}/labs/{labId}/validate` with the task's spec
5. The **backend** runs the validation command in the container via the orchestrator and matches the output (exact / contains / regex / line_count, or `expected_exit_code`)
6. The **backend** returns `{correct, output?}` — matching happens server-side

This separation means the orchestrator remains generic — it manages containers, terminals, and command execution — while each lab's tasks are defined entirely in YAML.

A legacy `POST /labs/{session_id}/validate` endpoint still exists that runs `validator.sh` scripts baked into container images. This is being replaced by the exec-based flow.

## File Inspection

For tasks that check file state (type: `file_check`), the orchestrator provides `POST /labs/{session_id}/inspect` which checks file existence, permissions, ownership, and content via `docker exec`.

## Docker Runtime Integration

All lab containers run with the **Sysbox** runtime (`sysbox-runc`). For Docker-course labs, the orchestrator controls the outer Sysbox container while the student uses Docker inside. Validation commands like `docker ps`, `docker inspect`, and `docker images` run inside the student's Docker daemon, treating the lab like a VM. No host port exposure is needed — checks use `curl localhost:PORT` inside the container.

## API Contract

All endpoints live under `http://localhost:8001`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Docker daemon connectivity check |
| `POST` | `/labs` | Start a lab container |
| `GET` | `/labs` | List all active sessions |
| `GET` | `/labs/by_key` | Recover session from Docker labels (`?user_id=&lab_id=`) |
| `GET` | `/labs/{id}` | Session info |
| `POST` | `/labs/{id}/activate` | Switch active lab (symlinks) |
| `POST` | `/labs/{id}/stop` | Pause container |
| `POST` | `/labs/{id}/resume` | Resume container |
| `DELETE` | `/labs/{id}` | Destroy container |
| `POST` | `/labs/{id}/exec` | Run command in container |
| `POST` | `/labs/{id}/validate` | Legacy: run validator.sh |
| `POST` | `/labs/{id}/inspect` | Check file state |
| `WS` | `/ws/terminal` | WebSocket terminal (JWT first-message handshake) |
| `GET` | `/schemas/yaml` | Lab YAML JSON Schema |
| `GET` | `/schemas/sample` | Sample lab YAML |
