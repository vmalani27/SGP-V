# API Test Cases

## Architecture

The frontend calls the **backend** (`localhost:8000`), which proxies to the **orchestrator** (`localhost:8001`). The frontend never talks to the orchestrator directly.

```
Frontend → Backend (8000) → Orchestrator (8001) → Docker
```

The backend reads the lab YAML from content-v2, extracts the environment config, and forwards it to the orchestrator. This lets the backend track user ID, session duration, and lab attempts. The terminal WebSocket is also proxied: the browser connects to the backend (`/api/v1/labs/ws/lab`) and the backend bridges frames to the orchestrator's internal `/ws/terminal`. The orchestrator address is never exposed to the browser.

---

## 1. Health Checks

### Backend
```bash
curl http://localhost:8000/health
```

### Orchestrator (internal)
```bash
curl http://localhost:8001/health
```

---

## 2. Backend Proxy — Start Lab

The backend reads the lab YAML, extracts `environment.base_image`, and forwards to orchestrator.

```bash
curl -X POST http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-1/start
```

**Expected:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "lab_id": "lab-1",
  "container_name": "sgp-lab-a1b2c3d4e5f6",
  "status": "running"
}
```

### Git course
```bash
curl -X POST http://localhost:8000/api/v1/labs/courses/git-fundamentals/labs/lab-1/start
```

### Lab not found
```bash
curl -X POST http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-999/start
```

**Expected:** `404` with `"detail": "Lab 'lab-999' config not found in course 'docker-mastery'"`

### Course not found
```bash
curl -X POST http://localhost:8000/api/v1/labs/courses/nonexistent/labs/lab-1/start
```

**Expected:** `404` with `"detail": "Course 'nonexistent' not found"`

---

## 3. Backend Proxy — Session Status

```bash
curl http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-1/status/<session_id>
```

**Expected:**
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

---

## 4. Backend Proxy — Stop / Resume / Destroy

```bash
# Stop
curl -X POST http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-1/stop/<session_id>

# Resume
curl -X POST http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-1/resume/<session_id>

# Destroy
curl -X DELETE http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-1/<session_id>
```

---

## 5. Backend Proxy — Exec

Run a command inside the container.

```bash
curl -X POST http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-1/exec/<session_id> \
  -H "Content-Type: application/json" \
  -d '{"command": "docker images -q | wc -l", "user": "student"}'
```

**Expected:**
```json
{
  "command": "docker images -q | wc -l",
  "exit_code": 0,
  "output": "2"
}
```

---

## 6. Orchestrator Direct API (internal)

The orchestrator API is internal. The backend proxies all calls. These endpoints exist for debugging only.

Base URL: `http://localhost:8001`

### Start (internal — backend calls this)
```bash
curl -X POST http://localhost:8001/labs \
  -H "Content-Type: application/json" \
  -d '{"lab_id": "lab-1", "image": "sgp-lab-docker:latest"}'
```

### List labs
```bash
curl http://localhost:8001/labs
```

### Get session
```bash
curl http://localhost:8001/labs/<session_id>
```

### Exec
```bash
curl -X POST http://localhost:8001/labs/<session_id>/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "whoami", "user": "student"}'
```

### Validate (legacy)
```bash
curl -X POST http://localhost:8001/labs/<session_id>/validate
```

### Inspect
```bash
curl -X POST http://localhost:8001/labs/<session_id>/inspect \
  -H "Content-Type: application/json" \
  -d '{"path": "/etc/passwd", "check": "exists"}'
```

### WebSocket Terminal

Auth is a first-message handshake (`{"type":"auth","token":<jwt>}`) — the token is never in the URL. In the running stack the browser connects to the **backend** proxy instead; this tests the orchestrator directly:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/labs/courses/docker-mastery/labs/lab-1/token/<session_id> | python3 -c "import sys, json; print(json.load(sys.stdin)['ws_token'])")
websocat --text ws://localhost:8001/ws/terminal
# then type: {"type":"auth","token":"$TOKEN"}
```

### Session recovery (labels)
```bash
curl "http://localhost:8001/labs/by_key?user_id=<uid>&lab_id=lab-1"
```
Returns the live session if a labelled container exists, `404` otherwise.

### Schemas
```bash
curl http://localhost:8001/schemas/yaml
curl http://localhost:8001/schemas/sample
```

---

## Full Lifecycle Test (via backend)

```bash
#!/bin/bash
set -e
BACKEND="http://localhost:8000"

echo "=== 1. Start Lab ==="
RESPONSE=$(curl -s -X POST $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/start)
echo $RESPONSE | python3 -m json.tool

SESSION_ID=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['session_id'])")
echo "Session ID: $SESSION_ID"

echo -e "\n=== 2. Check Status ==="
curl -s $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/status/$SESSION_ID | python3 -m json.tool

echo -e "\n=== 3. Exec: whoami ==="
curl -s -X POST $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/exec/$SESSION_ID \
  -H "Content-Type: application/json" \
  -d '{"command": "whoami", "user": "student"}' | python3 -m json.tool

echo -e "\n=== 4. Exec: docker images ==="
curl -s -X POST $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/exec/$SESSION_ID \
  -H "Content-Type: application/json" \
  -d '{"command": "docker images -q | wc -l", "user": "student"}' | python3 -m json.tool

echo -e "\n=== 5. Stop ==="
curl -s -X POST $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/stop/$SESSION_ID | python3 -m json.tool

echo -e "\n=== 6. Resume ==="
curl -s -X POST $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/resume/$SESSION_ID | python3 -m json.tool

echo -e "\n=== 7. Destroy ==="
curl -s -X DELETE $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/$SESSION_ID | python3 -m json.tool

echo -e "\n=== 8. Verify Destroyed ==="
curl -s $BACKEND/api/v1/labs/courses/docker-mastery/labs/lab-1/status/$SESSION_ID | python3 -m json.tool
```
