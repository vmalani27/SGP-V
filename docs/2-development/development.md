# Development Guide — SGP_V (LabOps)

Everything you need to edit and iterate on the project after setup.
For first-time environment setup, see [`docs/setup.md`](setup.md).

---

## 1. Architecture in one paragraph

Four services plus a Vagrant VM:

| Service | Dir | Port | Role |
|---------|-----|------|------|
| **frontend** | `next-app/` | 3000 | Next.js app: auth, learning wizard, xterm.js terminal, content bootstrap |
| **backend** | `backend/` | 8000 | FastAPI: Firebase auth, catalog/TOC from Firestore, enrollment/progress, content-version handshake (metadata + progress only — no orchestrator calls) |
| **worker** | `worker/` | n/a | AWS Lambda: downloaded locally to Floci, validates, seeds Firestore when S3 objects change |
| **orchestrator** | `orchestrator/` | 8001 | FastAPI in the Vagrant VM (as a systemd service): lab container lifecycle, exec, WebSocket terminal |
| **floci** | — (docker compose) | 4566 | S3-compatible content store |

Data flow: `content-v2/` → (publish script) → Floci/S3 → AWS Lambda worker → Firestore → frontend
catalog → frontend; frontend downloads the artifact bytes from S3 and serves
them locally.

---

## 2. Hot reload & volume mounts

The compose services mount source directories read-write, so edits **hot-reload**
with no rebuild:

| Service | Mount | Reload mechanism |
|---------|-------|------------------|
| frontend | `./next-app:/app` | Next.js dev server + `CHOKIDAR_USEPOLLING=true` |
| backend | `./backend:/app` | uvicorn `--reload` |
| orchestrator | `labops-orchestrator` systemd service in the Vagrant VM | uvicorn `--reload` on the synced folder (see §4) |

Volume notes:
- `frontend_next:/app/.next` and `frontend_content:/app/.content` are named
  volumes layered over the source mount. To reset the bootstrap content store
  (force a re-download) you must wipe them.

### Restart / rebuild

The local stack is `docker-compose.local.yml` + its env file. Define a shell
variable to keep commands short:

```powershell
$C = "docker compose -f docker-compose.local.yml --env-file environments/local/.env.local"
Invoke-Expression "$C up --build -d"      # rebuild images + start
Invoke-Expression "$C logs -f backend"    # follow backend logs
Invoke-Expression "$C down"               # stop (keep volumes)
Invoke-Expression "$C down -v"            # stop + wipe volumes (forces re-download/seed)
```

(`docker-compose.dev.yml` / `docker-compose.beta.yml` use the same pattern with
`--env-file environments/dev/.env.dev` / `environments/beta/.env.beta`.)

---

## 3. Everyday commands

```powershell
# Health baseline
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/content/version
curl http://localhost:8002/status

# Content: validate + publish (second time you can skip validate if no changes)
python scripts/validate_content.py content-v2/
python scripts/generate_manifest.py content-v2/ out/
# 2. Sync to Floci and Trigger Lambda
scripts\local\deploy_floci_lambda.bat

# 3. Check logs to see if Lambda processed it successfully
docker logs floci
```

See [`docs/TESTING.md`](TESTING.md) for the full manual suite and
[`postman/README.md`](../postman/README.md) for the API collection.

---

## 4. Orchestrator (Vagrant VM)

The orchestrator runs inside the Ubuntu VM as the **`labops-orchestrator` systemd
service** — a host process, **not** a container, so the VM's Docker daemon is
freed for lab containers only. It is a **dumb container executor** — it never
reads `lab.yaml`; the frontend drives the learning flow and sends commands to
it.

```powershell
vagrant up        # provision + start VM (Docker + Sysbox; builds lab images on first boot)
vagrant ssh       # shell into the VM
vagrant halt      # stop the VM
vagrant destroy   # teardown (loses VM state)
```

Operate the orchestrator with systemd (via `vagrant ssh`):

```bash
systemctl status labops-orchestrator       # is it up? why did it restart?
journalctl -fu labops-orchestrator         # live logs
sudo systemctl restart labops-orchestrator # apply config/env changes
```

Provisioning (`provisioning/install-orchestrator.sh`) seeds:
- deps → `/opt/sgp/venv-orchestrator` (kept **outside** the synced folder so it
  never syncs back to the host),
- env → `/opt/sgp/orchestrator.env` (the systemd unit's `EnvironmentFile`),
- unit → `/etc/systemd/system/labops-orchestrator.service`.

Lab containers (`labops-lab-{ubuntu,docker,git}`) are managed by Sysbox inside
the VM. The frontend talks to the orchestrator at `host.docker.internal:8001`
from compose (host port 8001 ← VM guest 8000); the backend never talks to the
orchestrator.

The VM's `ORCHESTRATOR_SECRET` is seeded into `/opt/sgp/orchestrator.env` by
`provisioning/install-orchestrator.sh` and must equal the shared secret the
frontend sends (`NEXT_PUBLIC_ORCHESTRATOR_SECRET`, default
`local-dev-super-secret`). Older `JWT_SECRET`-based notes no longer apply — the
orchestrator accepts only the shared secret (`app/utils/auth.py`).

---

## 5. Editing content

Course source of truth lives in `content-v2/`. See
[`docs/CONTENT-PIPELINE.md`](CONTENT-PIPELINE.md) (format/validation/publishing)
and [`docs/CONTENT-AUTHORING.md`](CONTENT-AUTHORING.md) (lab/chapter authoring).

Flow for a content change:
1. Edit files under `content-v2/`.
2. `python scripts/validate_content.py content-v2/` — must exit 0 (warnings OK).
3. Regenerate + republish (§3).
4. `curl -X POST http://localhost:8002/sync` or wait for the polling cycle;
   confirm the new version in `out/latest.json` and `/status`.

---

## 6. Common pitfalls

- **`aws` CLI against Floci** — use `--endpoint-url http://localhost:4566`
  (the CLI ignores the project's custom `AWS_ENDPOINT_URL`). Set
  `AWS_ACCESS_KEY_ID=test`, `AWS_SECRET_ACCESS_KEY=test`, or pass
  `--no-sign-request`.
- **`.env` for docker vs native** — the containers read interpolated values from
  the **env file passed via `--env-file`** (e.g. `environments/local/.env.local`
  for the local stack), not the per-service `.env` files. Keep
  `FIREBASE_PROJECT_ID` consistent between that env file and any service `.env`
  you run natively.
- **Content bootstrap `403 Forbidden` on dev/beta** — the backend signs
  presigned S3 download URLs using the AWS creds in the compose stack's
  `env_file` (`environments/dev/.env.dev` / `environments/beta/.env.beta`). If
  those `AWS_*` keys are missing/blank or the IAM principal lacks `s3:GetObject`
  on the bucket's `published/*`, the `/api/local-content/*` routes return `500`.
  Fill the AWS vars in the env file and ensure the IAM policy allows `GetObject`;
  also `docker compose down -v` to clear the failed local content volume.
- **Empty catalog** — `credentials.json` missing at
  `backend/app/core/credentials.json`, `FIREBASE_PROJECT_ID` unset, or
  `my-content-bucket` empty. See `docs/setup.md` §5–6.
- **WS/REST auth fails** on the orchestrator — `ORCHESTRATOR_SECRET` mismatch
  between the frontend's `NEXT_PUBLIC_ORCHESTRATOR_SECRET` and the orchestrator's
  env (`/opt/sgp/orchestrator.env` in the VM).
- **Content won't refresh** in the UI — wipe the frontend content volume to force
  a cold bootstrap:
  `docker compose -f docker-compose.local.yml --env-file environments/local/.env.local down -v` then bring it back up.
