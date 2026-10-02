# Chapter 2: Container Lifecycle

## You're On-Call. A Container Is Down.

It's 2 AM. Grafana spams your inbox. The monitoring dashboard shows your `payment-api` container is either not responding. You SSH into the server and type:

```bash
docker ps
```

Nothing. The container isn't listed. Does that mean it crashed? Was it removed? Did it never start?

##This is the scenario this chapter is built around. 

The commands you learn here — `docker ps -a`, `docker inspect`, `docker logs` — are not abstract exercises. They are your diagnostic tools the next time a container disappears on you.

Here is the complete on-call diagnostic sequence we will walk through together:

1. **`docker ps -a`** — Is the container still there in a stopped/exited state, or is it gone?
2. **`docker logs <name>`** — What did it print before it stopped? What was the last thing it tried to do?
3. **`docker inspect <name>`** — What was its exit code? When did it stop? What image and config was it running?
4. Based on those findings: decide whether to restart, remove and recreate, or escalate.

---

## Running a Container

Before we can diagnose anything, we need a container running. `docker run <image>` creates a container from the image and starts it immediately:

```bash
docker run -d --name demo alpine:latest sleep 300
```

`-d` runs it detached (in the background) so your terminal stays free. `--name demo` gives it a name you can reference in every subsequent command instead of a long hex ID.

Confirm it's running:

```bash
docker ps
```

## Container States

A container is never just "running" or "stopped" — it has a precise lifecycle with named states:

```
[created] ──► [running] ──► [paused]
                 │               │
                 ▼               ▼
             [exited]  ◄── (unpause)
                 │
                 ▼
            [removed]  (gone from docker ps -a)
```

The critical thing to understand: **`docker ps` only shows `running` containers.** If a container crashed or was stopped, `docker ps` shows nothing — which is exactly what you saw in the on-call scenario. To see everything including stopped containers:

```bash
docker ps -a
```

The `STATUS` column tells you everything: `Up 2 minutes` means running; `Exited (1) 5 minutes ago` means it crashed with exit code 1; `Exited (0) ...` means it finished cleanly.

> **Warning:** Stopped containers still take up disk space. The writable layer (everything the container wrote while running) stays on disk until you do `docker rm`. `docker ps -a` shows what's accumulating; `docker rm $(docker ps -aq)` removes all stopped containers at once.

---

## Diagnosing a Container That Exited

Let's simulate the on-call scenario. We'll deliberately create a container that exits immediately due to a bad command:

```bash
docker run --name broken alpine:latest sh -c 'echo "starting up..." && exit 1'
```

Now run the diagnostic sequence:

**Step 1 — Find the container:**

```bash
docker ps -a
```

You'll see `broken` with `Exited (1)` — it exited with a non-zero code. That's your first clue: the process considered this a failure.

**Step 2 — Read what it printed before it crashed:**

```bash
docker logs broken
```

You'll see `starting up...` — the last thing it output before the exit. In a real scenario this is where you'd find the actual error message: `database connection refused`, `config file not found`, `port already in use`.

**Step 3 — Read its full metadata:**

```bash
docker inspect broken
```

The JSON output contains everything Docker knows. The most useful fields when diagnosing a crash:

```bash
# Just the exit code and stop time
docker inspect broken --format '{{.State.Status}} — exit code {{.State.ExitCode}}'

# What image it was running
docker inspect broken --format '{{.Config.Image}}'

# Environment variables it was configured with
docker inspect broken --format '{{json .Config.Env}}'
```

Exit code `1` = application signalled failure. Exit code `137` = killed with SIGKILL (often OOM or `docker kill`). Exit code `0` = clean finish.

Clean up:

```bash
docker rm broken
```

---

## Listing Containers: `docker ps` Reference

### What's running right now

```bash
docker ps
```

Columns: `CONTAINER ID`, `IMAGE`, `COMMAND`, `CREATED`, `STATUS`, `PORTS`, `NAMES`. You'll use this many times per day.

### Everything, including stopped

```bash
docker ps -a
```

This is your first diagnostic step whenever a service seems to have disappeared.

### Filtering and formatting

```bash
# Show only IDs (useful in scripts)
docker ps -q

# Show all IDs including stopped (for bulk cleanup)
docker ps -aq

# Filter by name pattern
docker ps --filter "name=api"

# Filter by exit status
docker ps -a --filter "status=exited"
```

---

## Reading a Container's Configuration: `docker inspect`

`docker inspect <name-or-id>` returns the full JSON record Docker's daemon keeps for a container. It's the single most information-dense diagnostic command you have.

```bash
docker inspect demo
```

The output is a large JSON array. You'll almost always use `--format` to extract what you need:

```bash
# Runtime status
docker inspect demo --format '{{.State.Status}} (PID: {{.State.Pid}})'

# Container IP address
docker inspect demo --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

# Environment variables as JSON
docker inspect demo --format '{{json .Config.Env}}'

# Port mappings
docker inspect demo --format '{{json .NetworkSettings.Ports}}'
```

**What each top-level key contains:**
- `.State` — running/stopped, exit code, PID, timestamps
- `.Config` — image, env vars, command, working dir
- `.NetworkSettings` — IP address, port mappings, networks
- `.HostConfig` — CPU/memory limits, restart policy, volume mounts

---

## Reading a Container's Output: `docker logs`

Containers write their output to stdout and stderr. Docker captures both and you read them with:

```bash
docker logs <name-or-id>
```

This works on exited containers too — and for crashed containers, this is often the *only* way to find out what went wrong.

```bash
# Follow logs in real time (like tail -f)
docker logs -f demo

# Show only the last 50 lines
docker logs --tail 50 demo

# Show timestamps on each line
docker logs -t demo
```

Create a container that logs something, then read it:

```bash
docker run --name logger alpine:latest sh -c 'echo "INFO: service started"; echo "ERROR: port 5432 refused"'
docker logs logger
docker rm logger
```

> **In production, `docker logs` is not enough.** Log output that lives only inside the host is lost if the host dies, and it can't be searched across multiple containers. Production setups send container logs to a centralized system — Datadog, CloudWatch Logs, the ELK stack — using Docker logging drivers. You'll connect this to that in the CI/CD and Observability courses.

---

## The Full Lifecycle: stop, start, restart, rm

Now that you can inspect and diagnose, let's walk the full lifecycle of the `demo` container:

### Stop — send SIGTERM and wait

```bash
docker stop demo
```

Docker sends `SIGTERM` to PID 1 inside the container, then waits up to 10 seconds for the process to exit cleanly. If it hasn't exited by then, Docker sends `SIGKILL`. After stopping, `docker ps -a` shows the container as `Exited`.

### Start — resume the same container

```bash
docker start demo
```

This resumes the *same* container — same ID, same filesystem state, same config. It is not a new container. This matters if you wrote files inside it while it was running: those files are still there.

### Restart — stop and start in one step

```bash
docker restart demo
```

Equivalent to `docker stop demo && docker start demo`. Useful for applying a config change without recreating the container.

### Remove — delete it permanently

```bash
docker rm demo
```

`docker rm` requires the container to be stopped first. To force-stop and remove in one command:

```bash
docker rm -f demo
```

Once removed, `docker inspect demo` returns an error and the container is gone from `docker ps -a`.

### Bulk cleanup

```bash
# Remove all stopped containers
docker rm $(docker ps -aq)

# Or use prune
docker container prune -f
```

---

## Lab: Diagnose a Container That Exited Unexpectedly

> **Lab:** You are first responder. Figure out what happened.
>
> A container named `mystery-service` has exited. You did not start it — you're looking at someone else's server. Your job is to find out:
> 1. Is the container still present (just stopped) or was it removed?
> 2. What did it print before it exited?
> 3. What exit code did it exit with, and what does that tell you?
> 4. What image was it running and what command was it configured to run?
>
> **Setup — run this to create the broken state:**
>
> ```bash
> docker run --name mystery-service alpine:latest sh -c \
>   'echo "INFO: loading config from /app/config.yaml" && \
>    echo "ERROR: config file not found at /app/config.yaml" && \
>    exit 127'
> ```
>
> Now do NOT look at the command you just ran. Pretend you are a different engineer. Work through the diagnostic sequence:
>
> **Task 1:** Run the command that tells you whether `mystery-service` exists and what state it's in.
>
> **Task 2:** Run the command that shows you what the container printed before it stopped.
>
> **Task 3:** Run the command that shows you its exit code. Exit code `127` means "command not found" in shell — what does the log output tell you about what actually failed here?
>
> **Task 4:** Run the command that shows you what image and command the container was configured with.
>
> **Task 5:** Based on your findings, write the `docker run` fix — what single change would make this container succeed? (Hint: it needs a config file to exist.)
>
> Clean up when done:
>
> ```bash
> docker rm mystery-service
> ```

---

## Connecting to CI/CD and Production

The diagnostic sequence you learned here is not only for on-call. It maps directly to what CI systems and orchestrators do automatically:

- **CI health checks** run `docker inspect` looking at `.State.Health.Status` — containers that fail their health check are restarted or replaced before they even reach prod.
- **Kubernetes liveness probes** are the same concept at cluster scale: the orchestrator runs the equivalent of `docker inspect` on every pod on every node, constantly.
- **Restart policies** (`--restart unless-stopped`, `--restart on-failure`) are how you make a single-node Docker deployment resilient — the daemon runs the equivalent of the on-call diagnostic sequence and restarts crashed containers automatically.
- **Log aggregation** in every production setup routes `docker logs` output to a centralized system (CloudWatch, Datadog, Loki) so that *when* a container crashes, the log isn't lost with the container.

When you're debugging a production incident next week, this chapter is the mental model you'll be running.

---

## Key Takeaways

- `docker ps` shows only running containers; `docker ps -a` shows everything — always start here when a service disappears
- Three-command diagnostic sequence for a crashed container: `docker ps -a` → `docker logs` → `docker inspect`
- Exit codes matter: `0` = clean, `1` = app failure, `127` = command not found, `137` = killed by SIGKILL
- `docker inspect --format` lets you extract exactly the field you need instead of parsing raw JSON
- Stopped containers consume disk; `docker container prune -f` cleans them up
- In production, logs go to a centralized system — `docker logs` is the dev/debug tool, not the production tool
