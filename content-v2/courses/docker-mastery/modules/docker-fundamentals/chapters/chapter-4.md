# Chapter 4: Ephemeral Storage, Process Signals & Restart Policies

## In this chapter, you will

- Understand the Copy-on-Write (CoW) writable layer on top of read-only image layers
- Track container filesystem alterations in real time with `docker diff`
- Master process termination signals: graceful `SIGTERM` (`docker stop`) vs forceful `SIGKILL` (`docker kill`)
- Configure automated container restart policies for production resilience
- Practice host resource hygiene using Docker garbage collection commands

---

## The Writable Layer & Copy-on-Write (CoW)

Container images are **strictly read-only**. An image consists of immutable filesystem layers stacked on top of one another.

When you start a container from an image, the Docker storage driver (such as `overlay2`) adds a thin, private **writable layer** on top of the image stack:

```text
┌──────────────────────────────────────────────────────────┐
│  Container Writable Layer (Read / Write, Private)        │  ◄── New files & modifications
├──────────────────────────────────────────────────────────┤
│  Image Layer 3: Application code (Read-Only)             │
├──────────────────────────────────────────────────────────┤
│  Image Layer 2: Runtime dependencies (Read-Only)         │
├──────────────────────────────────────────────────────────┤
│  Image Layer 1: Base OS rootfs (Read-Only)               │
└──────────────────────────────────────────────────────────┘
```

When a process inside a container modifies an existing file that belongs to an image layer:
1. Docker copies the file from the read-only image layer up into the container's writable layer (**Copy-on-Write**).
2. The modification is written exclusively into the writable layer.
3. The underlying image layer remains completely untouched on the host disk.

If you launch ten separate containers from the same image, all ten containers share the identical read-only image layers, but each possesses its own isolated writable layer.

---

## Auditing Filesystem Changes with `docker diff`

Because Docker tracks the writable layer separately from the base image, you can inspect every modification a container has made since it started using `docker diff <container>`:

| Symbol | Status | Description |
|:---|:---|:---|
| **`A`** | Added | A new file or directory was created in the writable layer. |
| **`C`** | Changed | An existing file or directory inherited from the image was modified. |
| **`D`** | Deleted | A file or directory from the image was deleted (masked by a whiteout file). |

For example, creating a file `/tmp/config.json` inside a container will produce:
```text
C /tmp
A /tmp/config.json
```

---

## Ephemeral Lifecycle: Stop vs. Remove vs. Recreate

The writable layer lives and dies with the container object:

- **`docker stop`**: Suspends the container process. The writable layer remains intact on host storage. Resuming the container with `docker start` preserves all written data.
- **`docker rm`**: Deletes the container entity from the engine. Its writable layer is immediately purged from disk.
- **`docker run` (new container)**: Instantiates a fresh container entity with an empty writable layer. It inherits nothing from previous containers.

```text
Container A (stop ──► start)  ──► Data in writable layer survives
Container A (rm)             ──► Writable layer destroyed
Container B (new run)        ──► Starts completely clean
```

> [!IMPORTANT]
> Because container writable layers are ephemeral, applications requiring long-term state (such as relational databases or object stores) must decouple their storage using **Docker Volumes**, which we cover extensively in Module 4.

---

## Process Signals: `SIGTERM` vs. `SIGKILL`

When shutting down containers, how you terminate the process dictates whether data flushes cleanly or corrupts.

### Graceful Shutdown: `docker stop` (`SIGTERM`)
When you run `docker stop <container>`:
1. Docker transmits a `SIGTERM` (signal 15) to **PID 1** inside the container namespace.
2. The process receives the signal and has time to close open database connections, finish in-flight HTTP requests, and flush disk buffers.
3. Docker starts a default 10-second grace timer.
4. If the process exits cleanly before the timeout expires, it terminates with **exit code `0`**.
5. If the process does not terminate within the grace period (e.g. `docker stop -t 30`), Docker sends `SIGKILL`.

### Forceful Termination: `docker kill` (`SIGKILL`)
When you run `docker kill <container>`:
1. Docker immediately transmits a `SIGKILL` (signal 9) directly to the kernel namespace.
2. The kernel halts the process instantly without notification to the application.
3. The process cannot catch or intercept `SIGKILL`.
4. The container terminates immediately with **exit code `137`** (128 + 9).

---

## Container Restart Policies

In production, processes crash due to uncaught exceptions, memory exhaustion, or transient failures. Docker provides automated restart policies via the `--restart` flag:

| Policy Flag | Behavior | Common Production Use Case |
|:---|:---|:---|
| `--restart no` | Never restarts the container (default). | One-off batch jobs, database migrations. |
| `--restart on-failure[:max]` | Restarts only if the container exits with a non-zero exit code. Optional max retry limit. | Background workers, queue consumers. |
| `--restart unless-stopped` | Always restarts unless an administrator explicitly stopped it via `docker stop`. Survives host reboot. | Web servers, API gateways, production services. |
| `--restart always` | Always restarts regardless of exit code or manual stop upon daemon restart. | Critical system-level daemons. |

Example:
```bash
docker run -d --name resilient-api --restart on-failure:5 -p 8080:80 nginx:alpine
```

---

## Garbage Collection & Storage Hygiene

Stopped containers still occupy disk space because their writable layers remain preserved in the host storage driver directory (`/var/lib/docker/overlay2`).

To prevent disks from exhausting inodes and disk capacity:

```bash
# Remove all stopped containers
docker container prune -f

# Remove all unused containers, unused networks, and dangling images
docker system prune -f

# Query current Docker disk allocation breakdown
docker system df
```
