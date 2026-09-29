# Chapter 4: Ephemeral Storage, Signals & Cleanup

:::terminal-demo
id: storage-and-signals
image: labops-docker:latest
pre_pull:
  - alpine:latest
  - nginx:alpine
:::

---

> **Note — Prerequisites:** What you need to know before reading this chapter
>
> - **Container lifecycle (Chapter 2):** `docker ps -a`, `docker inspect`, `docker logs` — you'll use these throughout
> - **Linux process signals — specifically SIGTERM and SIGKILL:** what they are, how processes receive them, and the crucial difference (SIGTERM can be caught and handled; SIGKILL cannot) — covered in Linux Fundamentals chapter 3
> - **PID 1 in a process tree:** why PID 1 is special and why containers care about it — also Linux Fundamentals chapter 3
> - **What a filesystem is:** files, directories, write operations — basic Linux literacy

---

## 3 AM: Your CI Pipeline Just Killed the Build Server

The alert fires at 3 AM. Your GitHub Actions self-hosted runner — a Linux VM running Docker — is rejecting new builds:

```
Error response from daemon: write /var/lib/docker/overlay2/...: no space left on device
```

The disk is full. Every build for the last two weeks has been pulling images, running containers, and leaving them behind. Nobody ever cleaned up. The disk filled silently until it didn't.

This is the most common Docker ops problem on CI infrastructure, and it's entirely preventable once you understand what's accumulating and why.

Here's what's on that disk:

- **Stopped containers** — every `docker run` that finished but wasn't `docker rm`'d left its writable layer behind
- **Dangling images** — every `docker build` that rebuilt an image left the previous version's layers orphaned
- **Unused networks** — Docker creates network objects that outlive the containers that used them

One command clears all of it:

```bash
docker system prune -f
```

But to understand *why* this accumulates, you need to understand how container storage actually works.

---

## How Container Storage Works: The Writable Layer

Every container image is a stack of **read-only layers**. When you start a container, Docker (using the `overlay2` storage driver on Linux) adds one more layer on top — the writable layer — that belongs only to this container:

```
┌──────────────────────────────────────────────────────────┐
│  Container Writable Layer (read/write — ephemeral)       │  ← files your container creates/modifies
├──────────────────────────────────────────────────────────┤
│  Image Layer 3: Application code (read-only)             │
├──────────────────────────────────────────────────────────┤
│  Image Layer 2: Runtime dependencies (read-only)         │
├──────────────────────────────────────────────────────────┤
│  Image Layer 1: Base OS (read-only)                      │
└──────────────────────────────────────────────────────────┘
```

When a container writes or modifies a file that came from a read-only image layer, Docker uses **Copy-on-Write (CoW)**:

1. The file is copied from the read-only image layer up into the writable layer
2. The copy is modified
3. The read-only original is untouched

Ten containers running from the same image share the same read-only layers. Each has its own isolated writable layer. This is why Docker images are storage-efficient — the layers are shared.

### Watching changes in real time: `docker diff`

You can see exactly what a container has written to its writable layer:

```bash
docker run -d --name writer alpine:latest sleep 300

# Write a file inside the container
docker exec writer sh -c 'echo "hello" > /tmp/testfile.txt && mkdir /tmp/newdir'

# See what changed
docker diff writer
```

Output:
```
C /tmp
A /tmp/testfile.txt
A /tmp/newdir
```

| Symbol | Meaning |
|:-------|:--------|
| `A` | Added — new file or directory |
| `C` | Changed — existing file or directory modified |
| `D` | Deleted — file from the image was removed |

### The critical implication: writable layers are ephemeral

When you `docker rm` a container, **its writable layer is deleted with it.** All those files the container wrote — gone. This is intentional design. Containers are meant to be stateless and replaceable.

```bash
docker rm writer
# The file /tmp/testfile.txt no longer exists anywhere
```

This is why you never run a production database inside a container without a volume. When the container is replaced (crash, upgrade, rebalance), the data goes with it.

> **Note:** CI containers are always fresh for exactly this reason. Every CI build starts from a clean writable layer. No state from the previous build bleeds in. This reproducibility is one of the main reasons CI pipelines run in containers.

> **Note:** Databases need volumes for exactly this reason. A volume is a directory that lives outside the container's writable layer and survives `docker rm`. We cover volumes in the next module.

---

## Signals: How Docker Stops Containers

When you tell Docker to stop a container, what happens to the process running inside it? This is not academic — getting it wrong corrupts databases, drops in-flight HTTP requests, and leaves log files half-written.

### `docker stop`: graceful shutdown via SIGTERM

```bash
docker stop <name>
```

What Docker actually does:
1. Sends **SIGTERM** (signal 15) to **PID 1** inside the container
2. PID 1 receives it and has the opportunity to: flush buffers, close database connections, finish in-flight requests, write a clean shutdown log line
3. Docker waits up to **10 seconds** (the grace period)
4. If the process exits within the grace period → clean shutdown, exit code `0`
5. If the process does **not** exit within the grace period → Docker sends SIGKILL

The grace period can be extended: `docker stop -t 30 <name>` gives 30 seconds. A PostgreSQL container doing a checkpoint needs this; a stateless HTTP server probably doesn't.

### `docker kill`: immediate death via SIGKILL

```bash
docker kill <name>
```

Docker sends **SIGKILL** (signal 9) immediately to the kernel. The kernel terminates the process instantly — no notification to the application, no chance to clean up. Exit code: **137** (128 + 9).

SIGKILL cannot be caught, blocked, or ignored. It is the operating system forcibly reclaiming the process. A database receiving SIGKILL may have unflushed write-ahead log entries, resulting in data corruption or needing a recovery run on restart.

### How to tell which happened: exit codes

```bash
docker inspect <name> --format '{{.State.ExitCode}}'
```

- `0` = clean exit (process exited on its own or after SIGTERM)
- `137` = killed by SIGKILL (either `docker kill`, or `docker stop` timeout expired)
- `143` = killed by SIGTERM and the process propagated it (less common)
- any non-zero = application-level failure

---

## Why PID 1 Matters

Inside a container, the process you start becomes PID 1. On Linux, PID 1 has a special responsibility: it must handle signals and reap zombie child processes.

If your container runs a shell script as PID 1 and that script starts your application as a child process, the shell may not forward SIGTERM to the child. The application never receives the shutdown signal. The shell sits there until Docker's grace period expires and sends SIGKILL. Your application gets SIGKILL every time — no graceful shutdown, ever.

The fix: use `exec` in your entrypoint script so the application *becomes* PID 1:

```bash
# Bad — shell is PID 1, app is a child, SIGTERM not forwarded
#!/bin/sh
python app.py

# Good — exec replaces the shell, python IS PID 1, receives SIGTERM directly
#!/bin/sh
exec python app.py
```

Or use the JSON array form in your Dockerfile's `ENTRYPOINT` / `CMD` — this also avoids the shell wrapper:

```dockerfile
# Bad — runs via shell: /bin/sh -c "python app.py"
CMD python app.py

# Good — runs directly, python is PID 1
CMD ["python", "app.py"]
```

---

## Lab: Catch a Signal and Do a Graceful Shutdown

> **Lab:** Your task: verify your container handles SIGTERM gracefully before pushing to production.
>
> A container that ignores SIGTERM will always be force-killed after the grace period. That's 10 seconds of unnecessary wait on every deployment or restart, plus the risk of data corruption for stateful services.
>
> In this lab you'll observe the difference between a container that handles SIGTERM and one that ignores it, then measure the shutdown time.
>
> **Part 1 — The container that ignores SIGTERM (the bad case):**
>
> ```bash
> # This shell script doesn't handle signals — sleep keeps running
> docker run -d --name bad-shutdown alpine:latest sh -c 'echo "started"; sleep 300'
> ```
>
> Time how long `docker stop` takes:
>
> ```bash
> time docker stop bad-shutdown
> ```
>
> It should take about **10 seconds** — that's the full grace period expiring before Docker gives up and sends SIGKILL. Check the exit code:
>
> ```bash
> docker inspect bad-shutdown --format '{{.State.ExitCode}}'
> # 137 = killed by SIGKILL
> ```
>
> Cleanup:
>
> ```bash
> docker rm bad-shutdown
> ```
>
> **Part 2 — The container that handles SIGTERM (the good case):**
>
> The `sh` built-in `trap` command catches signals. `exec` makes the shell *become* PID 1 properly:
>
> ```bash
> docker run -d --name good-shutdown alpine:latest sh -c '
>   trap "echo SIGTERM received, shutting down cleanly; exit 0" TERM
>   echo "started, waiting for signals"
>   while true; do sleep 1; done
> '
> ```
>
> Verify it started:
>
> ```bash
> docker logs good-shutdown
> ```
>
> Now stop it and time it:
>
> ```bash
> time docker stop good-shutdown
> ```
>
> It should stop in **under 1 second** — the trap fired, the process exited cleanly before the grace period. Check the exit code:
>
> ```bash
> docker inspect good-shutdown --format '{{.State.ExitCode}}'
> # 0 = clean exit
> ```
>
> And read the shutdown message from the logs:
>
> ```bash
> docker logs good-shutdown
> # "SIGTERM received, shutting down cleanly"
> ```
>
> Cleanup:
>
> ```bash
> docker rm good-shutdown
> ```
>
> **What this means in production:** a 10-second shutdown vs a sub-second shutdown on every rolling deployment, restart, or scale-down event. For a service with 20 instances rolling-updated, that's 200 seconds vs 20 seconds minimum downtime window — and that's before accounting for data integrity.

---

## Disk Hygiene: Keeping CI Runners Clean

Back to that 3 AM disk-full alert. Here's how to understand what's on disk and how to clean it:

### See what Docker is using

```bash
docker system df
```

Output:
```
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          23        5         8.2GB     6.1GB (74%)
Containers      47        2         1.4GB     1.3GB (99%)
Local Volumes   8         3         2.1GB     0B (0%)
Build Cache     0         0         0B        0B
```

This tells you: 74% of image storage is reclaimable (not used by any running container), and 99% of container storage is reclaimable (stopped containers that haven't been removed).

### Cleaning up

```bash
# Remove all stopped containers + dangling images + unused networks
docker system prune -f

# Same, but also remove unused images (not just dangling)
docker system prune -af

# Remove only stopped containers
docker container prune -f

# Remove only dangling images (untagged layers from old builds)
docker image prune -f

# Remove all unused images (nothing running uses them)
docker image prune -af
```

> **Warning:** `-af` on image prune will remove images you pulled but aren't currently running. If you pull images manually and want to keep them even when no container is using them, use `-f` (dangling only) instead. On a CI runner, `-af` is usually fine — the next build will re-pull what it needs.

### The preventive approach: `--rm` for ephemeral containers

If you know a container's output is all you need and you don't need to inspect it afterwards, `--rm` removes it automatically when it exits:

```bash
docker run --rm alpine:latest echo "do something and clean up"
# Container is gone as soon as it exits — no docker rm needed
```

CI pipelines use `--rm` on most steps. The disk problem only happens when `--rm` is omitted or when long-running services are left as stopped containers after development.

### Scheduling cleanup on CI runners

The real fix for the 3 AM scenario: a cron job on each runner:

```bash
# /etc/cron.d/docker-cleanup
# Runs at 3am daily, cleans up containers and dangling images
0 3 * * * root docker system prune -f >> /var/log/docker-cleanup.log 2>&1
```

---

## Restart Policies

For long-running services (web servers, background workers), you want Docker to restart containers automatically if they crash without requiring manual intervention:

```bash
docker run -d --name api --restart unless-stopped -p 8080:80 nginx:alpine
```

| Policy | Behaviour | Use case |
|:-------|:----------|:---------|
| `no` | Never restart (default) | One-off jobs, migrations |
| `on-failure[:N]` | Restart only on non-zero exit; optionally limit to N retries | Workers that might encounter transient errors |
| `unless-stopped` | Always restart unless manually stopped with `docker stop`; survives daemon restart | Production web services, APIs |
| `always` | Always restart, even after manual stop, after daemon restart | Critical system daemons |

```bash
# Inspect what restart policy a container has
docker inspect api --format '{{.HostConfig.RestartPolicy.Name}}'
```

> **Tip:** `--restart unless-stopped` is the Kubernetes `restartPolicy: Always` equivalent for single-node Docker setups. In Kubernetes, the kubelet does this automatically for every pod — there's no equivalent of Docker's `no` policy in a Deployment.

---

## Connecting to Production and CI/CD

The three topics in this chapter connect directly to how production infrastructure is designed:

**Ephemeral storage + volumes:**
- Every 12-factor application is designed to write nothing to its local filesystem during runtime. Logs go to stdout (captured by Docker), state goes to an external database or object storage. CI pipelines depend on containers being stateless — that's what makes them reproducible.
- When you need persistence (databases, upload directories, caches), volumes are the answer — that's the next module.

**SIGTERM handling:**
- Kubernetes's rolling deployments, Kubernetes HPA scale-downs, and ECS task replacements all work by sending SIGTERM to containers, waiting `terminationGracePeriodSeconds`, then sending SIGKILL. An application that doesn't handle SIGTERM gets killed dirty on every deploy. This is one of the most common causes of request drops during Kubernetes rolling updates.

**Disk hygiene:**
- Every CI provider (GitHub Actions, GitLab CI, CircleCI self-hosted) warns about disk space in their runner docs. The advice is always the same: `docker system prune` in your pipeline or on a schedule. Knowing *why* it fills up lets you make better decisions about what to prune and when.

---

## Key Takeaways

- Container storage is a thin writable layer on top of read-only image layers; when the container is removed, the writable layer is gone — data written inside a container is ephemeral by design
- `docker diff` shows exactly what a container has written, modified, or deleted in its writable layer
- `docker stop` sends SIGTERM and waits (graceful); `docker kill` sends SIGKILL immediately (forceful); exit code `137` means SIGKILL
- Applications must handle SIGTERM and exit cleanly — otherwise every shutdown is a SIGKILL, every deploy drops requests or corrupts state
- Use the JSON array form (`CMD ["app"]` not `CMD app`) or `exec` in shell entrypoints so your app is PID 1 and receives signals directly
- `docker system df` shows disk usage; `docker system prune -f` clears stopped containers + dangling images; schedule this on CI runners
- `--restart unless-stopped` makes a container resilient to crashes without requiring manual intervention
