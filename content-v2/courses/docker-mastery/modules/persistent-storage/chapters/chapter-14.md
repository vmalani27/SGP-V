# Chapter 14: Storage Architecture: Writable Layers, Named Volumes & tmpfs

## In this chapter, you will

- Master the four Docker storage mechanisms: Writable Layers, Named Volumes, Bind Mounts, and `tmpfs`
- Understand the performance cost of the `overlay2` storage driver vs native volume I/O
- Manage the complete lifecycle of Docker volumes using CLI inspection tools
- Adopt modern `--mount` syntax over legacy `-v` flags for production safety
- Isolate sensitive ephemeral state into RAM using `tmpfs` mounts

---

## The Four Storage Mechanisms

Every container has access to four distinct types of storage, each designed for a specific operational lifecycle:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ HOST MACHINE                                                           │
│                                                                        │
│  ┌───────────────────────┐              ┌───────────────────────────┐  │
│  │ Docker Engine         │              │ Host Filesystem           │  │
│  │                       │              │                           │  │
│  │  ┌─────────────────┐  │              │  ┌─────────────────────┐  │  │
│  │  │ Container       │  │              │  │ /var/lib/docker/    │  │  │
│  │  │                 │  │              │  │   volumes/my-vol/   │  │  │
│  │  │ 1. Writable     │  │              │  └──────────┬──────────┘  │  │
│  │  │    Layer (CoW)  │  │                            │             │  │
│  │  │                 │  │  2. Named Volume Mount     │             │  │
│  │  │ /var/data ◄─────┼──┼────────────────────────────┘             │  │
│  │  │                 │  │                                          │  │
│  │  │ 3. Bind Mount   │  │  4. In-Memory tmpfs                      │  │
│  │  │ /app/src ◄──────┼──┼───────────────┐     ┌─────────────────┐  │  │
│  │  │ /tmp/cache ◄────┼──┼─────────────┐ │     │ Host RAM        │  │  │
│  │  └─────────────────┘  │             │ │     │ (non-persistent)│  │  │
│  └───────────────────────┘             │ │     └────────┬────────┘  │  │
│                                        │ │              │           │  │
│  ┌─────────────────────────────────────┴─┴──────────┐   │           │  │
│  │ /home/developer/project/src (Local Host Dir)     │   │           │  │
│  └──────────────────────────────────────────────────┘   │           │  │
│                                                         │           │  │
└─────────────────────────────────────────────────────────┼───────────┘
                                                          ▼
```

| Storage Type | Location | Persistence | Primary Use Case |
|:---|:---|:---|:---|
| **Writable Layer** | `/var/lib/docker/overlay2` | Tied to container lifecycle | Temporary process scratch files. |
| **Named Volume** | `/var/lib/docker/volumes` | Survives container deletion | Production databases, uploads, stateful state. |
| **Bind Mount** | Arbitrary host directory | Independent of Docker | Local source code mounting for hot reloading. |
| **`tmpfs`** | Host system RAM | Wiped on container stop | High-speed cache, sensitive tokens/keys. |

---

## Why Databases Cannot Run on the Writable Layer

In Chapter 4, you saw that the writable layer is ephemeral. However, there is a second, critical engineering reason why production databases (PostgreSQL, MySQL, MongoDB, Redis) must never write directly to the container root filesystem: **I/O performance overhead**.

The `overlay2` storage driver uses a union filesystem:
1. When a database performs a write or updates an existing file block, the storage driver must search through the read-only image layers, copy the entire file into the upper writable layer, and apply the modification (**Copy-on-Write write amplification**).
2. For random read/write workloads (like B-Tree index updates and write-ahead logs), this adds significant latency and CPU overhead.

**Docker Volumes completely bypass the storage driver.** A volume is an un-unionized directory on the host filesystem managed by the Docker daemon. Read and write operations to a volume execute at **native bare-metal disk speeds**.

---

## Named Volumes: Mechanics & Lifecycle

A named volume is a storage entity with an independent lifecycle:

```bash
# 1. Create a dedicated volume
docker volume create pg-data

# 2. Inspect volume metadata and host mountpoint
docker volume inspect pg-data
```

The inspect output reveals the physical directory managed by Docker:
```json
[
  {
    "CreatedAt": "2026-09-09T01:00:00Z",
    "Driver": "local",
    "Labels": {},
    "Mountpoint": "/var/lib/docker/volumes/pg-data/_data",
    "Name": "pg-data",
    "Scope": "local"
  }
]
```

### Volume Lifecycle Management
- **List volumes:** `docker volume ls`
- **Audit disk usage:** `docker system df -v`
- **Delete an unused volume:** `docker volume rm <volume-name>`
- **Prune unattached volumes:** `docker volume prune -f`

---

## Modern Syntax: `--mount` vs Legacy `-v`

In early Docker versions, volumes and bind mounts were mounted exclusively via the `-v` / `--volume` flag:

```bash
# Legacy syntax:
docker run -d -v pg-data:/var/lib/postgresql/data postgres:16-alpine
```

While concise, `-v` has significant pitfalls:
- If the source volume or directory does not exist, Docker silently creates an empty host directory instead of failing.
- Options like `:ro` or `:cached` are appended in a comma-separated trailing string that is difficult to parse or validate in automated scripts.

The modern standard is the explicit `--mount` flag:

```bash
# Modern, production-grade syntax:
docker run -d \
  --name db-service \
  --mount type=volume,source=pg-data,target=/var/lib/postgresql/data \
  postgres:16-alpine
```

Key attributes of `--mount`:
- `type`: `volume`, `bind`, or `tmpfs`.
- `source`: Volume name (for volumes) or absolute path (for bind mounts).
- `target`: Mount destination path inside the container namespace.
- `readonly`: Optional boolean flag (`readonly` or `ro`) to prevent write access.

---

## In-Memory Ephemeral Mounts (`tmpfs`)

Applications frequently generate sensitive artifacts (decrypted TLS certificates, session tokens) or high-volume temporary caches (Redis dump files, test socket descriptors) that must **never** be flushed to permanent disk storage.

The `tmpfs` mount allocates storage directly in the host's Linux kernel virtual memory:

```bash
docker run -d \
  --name secure-worker \
  --mount type=tmpfs,target=/app/secure-cache,tmpfs-size=64m,tmpfs-mode=1777 \
  alpine:latest sleep 300
```

- When the container stops, the RAM is returned to the kernel. No bits remain on physical NVMe/SSD storage.
- File operations inside `/app/secure-cache` achieve ultra-low latency RAM throughput.

---

## Key Takeaways

1. **Decouple state from execution:** Containers should be stateless and disposable; state must live in named volumes.
2. **Raw I/O performance:** Always mount database directories into named volumes to avoid `overlay2` storage driver penalties.
3. **Favor `--mount`:** Use explicit `type=volume,source=...,target=...` syntax in production automation.
4. **Use `tmpfs` for secrets:** Never write temporary credentials or ephemeral tokens to disk.
