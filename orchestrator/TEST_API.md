# API Test Cases

## Architecture

The frontend calls the **orchestrator directly** (`localhost:8001`) — lab lifecycle, validation exec, and the terminal WebSocket. The **backend** (`localhost:8000`) handles only Firebase auth, course metadata/progress, and the content-version handshake; it ships no lab proxy routers (the old `/api/v1/labs*`, `/api/v1/demos*`, `WS /api/v1/labs/ws/lab` were removed). It never sees lab traffic.

```
Frontend → Orchestrator (8001) → Docker
Backend  (8000) — metadata / progress / version handshake only
```

The **client** supplies the lab's environment config (`{image, apt_packages,
pre_pull, setup}`) plus `user_id`/`lab_id` in the start request body from its
local lab config — the orchestrator never reads `lab.yaml`. The terminal
WebSocket is also direct: the browser connects to
`ws://<ORCHESTRATOR_URL>/ws/terminal` and sends the shared secret as its first
message. All REST calls below use `Authorization: Bearer $ORCHESTRATOR_SECRET`.

> The 404-style "Lab not found / Course not found" checks used to live on the
> removed backend proxy (which resolved `lab.yaml`). The orchestrator has no
> content knowledge and accepts any `lab_id`.

---

## 1. Health Checks

### Backend
```bash
curl http://localhost:8000/health
```

### Orchestrator (host :8001 → VM guest :8000)
```bash
curl http://localhost:8001/health
```

---

## 2. Orchestrator — Start Lab

The client sends the environment config in the body (from its local lab config —
`docker-basic` resolves to the image + pre-pull list below). Without a live
container for the user+lab, the orchestrator provisions fresh; with one (found
by Docker labels), it re-attaches and re-applies `setup`.

```bash
ORCH="http://localhost:8001"
SECRET="local-dev-super-secret"

curl -s -X POST $ORCH/labs \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "lab_id": "lab-1",
    "image": "labops-docker:latest",
    "apt_packages": [],
    "pre_pull": ["nginx:alpine", "alpine:latest"],
    "setup": []
  }'
```

**Expected:**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "status": "running",
  "container_name": "labops-lab-a1b2c3d4e5f6",
  "user_id": "test-user",
  "lab_id": "lab-1"
}
```

### Git course
```bash
curl -s -X POST $ORCH/labs \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-user","lab_id":"lab-1","image":"labops-ubuntu:latest","apt_packages":[],"pre_pull":[],"setup":[]}'
```

---

## 3. Session — Status / Recovery

```bash
# by session id
curl -s $ORCH/labs/<session_id>

# recover from Docker labels (user_id + lab_id) — survives orchestrator restarts
curl -s "$ORCH/labs/by_key?user_id=test-user&lab_id=lab-1"
```

**Expected (status):**
```json
{
  "session_id": "a1b2c3d4e5f6",
  "lab_type": "custom",
  "lab_id": "lab-1",
  "container_id": "f6e5d4c3b2a1",
  "container_name": "labops-lab-a1b2c3d4e5f6",
  "status": "running",
  "created_at": "2026-07-12T10:30:00+00:00",
  "user_id": "test-user"
}
```

---

## 4. Stop / Resume / Destroy

```bash
# Stop (pause)
curl -s -X POST $ORCH/labs/<session_id>/stop

# Resume (restart)
curl -s -X POST $ORCH/labs/<session_id>/resume

# Destroy (force remove)
curl -s -X DELETE $ORCH/labs/<session_id>
```

---

## 5. Exec — validation commands

Run a command inside the container (`user` honors `validation.execution_user`).

```bash
curl -s -X POST $ORCH/labs/<session_id>/exec \
  -H "Authorization: Bearer $SECRET" \
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

## 6. WebSocket Terminal

Auth is a first-message handshake (`{"type":"auth","token":<shared secret>}`) —
the token is never in the URL. The browser connects **directly** to
`ws://<ORCHESTRATOR_URL>/ws/terminal` (no backend proxy).

```bash
websocat --text ws://localhost:8001/ws/terminal
# then type:
{"type":"auth","token":"local-dev-super-secret"}
```

---

## 7. Schemas

```bash
curl $ORCH/schemas/yaml
curl $ORCH/schemas/sample
```

---

## Full Lifecycle Test (orchestrator direct)

```bash
#!/bin/bash
set -e
ORCH="http://localhost:8001"
SECRET="local-dev-super-secret"

echo "=== 1. Start Lab ==="
RESPONSE=$(curl -s -X POST $ORCH/labs \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-user","lab_id":"lab-1","image":"labops-docker:latest","apt_packages":[],"pre_pull":["nginx:alpine"],"setup":[]}')
echo $RESPONSE | python3 -m json.tool

SESSION_ID=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['session_id'])")
echo "Session ID: $SESSION_ID"

echo -e "\n=== 2. Recover by labels ==="
curl -s -H "Authorization: Bearer $SECRET" "$ORCH/labs/by_key?user_id=test-user&lab_id=lab-1" | python3 -m json.tool

echo -e "\n=== 3. Exec: whoami ==="
curl -s -X POST -H "Authorization: Bearer $SECRET" $ORCH/labs/$SESSION_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "whoami", "user": "student"}' | python3 -m json.tool

echo -e "\n=== 4. Exec: docker images ==="
curl -s -X POST -H "Authorization: Bearer $SECRET" $ORCH/labs/$SESSION_ID/exec \
  -H "Content-Type: application/json" \
  -d '{"command": "docker images -q | wc -l", "user": "student"}' | python3 -m json.tool

echo -e "\n=== 5. Stop ==="
curl -s -X POST -H "Authorization: Bearer $SECRET" $ORCH/labs/$SESSION_ID/stop | python3 -m json.tool

echo -e "\n=== 6. Resume ==="
curl -s -X POST -H "Authorization: Bearer $SECRET" $ORCH/labs/$SESSION_ID/resume | python3 -m json.tool

echo -e "\n=== 7. Destroy ==="
curl -s -X DELETE -H "Authorization: Bearer $SECRET" $ORCH/labs/$SESSION_ID | python3 -m json.tool

echo -e "\n=== 8. Verify Destroyed ==="
curl -s -H "Authorization: Bearer $SECRET" $ORCH/labs/$SESSION_ID | python3 -m json.tool
```