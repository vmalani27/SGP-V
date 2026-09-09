# Chapter 15: Production Storage Operations, Backups & Disaster Recovery

## In this chapter, you will

- Execute automated volume backups using ephemeral utility containers
- Run disaster recovery procedures to restore production data from compressed archives
- Resolve the non-root Host UID/GID permission trap on mounted storage
- Prevent data leakage by isolating sensitive runtime tokens in volatile RAM (`tmpfs`)

---

## The Ephemeral Utility Container Pattern

A common anti-pattern is installing backup utilities (`tar`, `gzip`, `aws-cli`, `rclone`) directly inside application container images. Bloating application images with backup tooling expands attack surface and violates single-responsibility principles.

The industry-standard Docker pattern is the **Ephemeral Utility Container**:
1. Run a lightweight, minimal container (`alpine:latest`) with the `--rm` flag.
2. Mount the production volume as **read-only** (`readonly`).
3. Bind mount a host backup directory.
4. Execute the archive command and immediately terminate. The utility container disappears, leaving a clean archive on the host.

```text
┌────────────────────────────────────────────────────────────┐
│ EPHEMERAL BACKUP RUNBOOK                                   │
│                                                            │
│   Named Volume: [ db-data ] (Production State)             │
│        │                                                   │
│        ▼ (read-only mount)                                 │
│   ┌──────────────────────────────────────────────┐         │
│   │ Ephemeral Container: alpine (docker run --rm)│         │
│   │   tar czf /backup/snapshot.tar.gz -C /data . │         │
│   └──────────────────────┬───────────────────────┘         │
│                          ▼ (write mount)                   │
│   Host Backup Storage: /var/backups/snapshot.tar.gz        │
└────────────────────────────────────────────────────────────┘
```

### Executing an Automated Snapshot
```bash
docker run --rm \
  --mount type=volume,source=db-data,target=/source,readonly \
  --mount type=bind,source=/var/backups,target=/backup \
  alpine:latest \
  tar czf /backup/db-data-$(date +%Y%m%d).tar.gz -C /source .
```

Key principles of this command:
- `--rm`: Automatically removes the container filesystem upon completion.
- `readonly`: Ensures the backup process cannot write, corrupt, or alter production data during the archive operation.
- `-C /source .`: Strips absolute directory prefixes so the archive unpacks cleanly into any destination root.

---

## Disaster Recovery & Volume Restoration

When a volume suffers corruption or an administrator accidentally purges storage, the disaster recovery runbook restores the dataset into a fresh volume before attaching it to a replacement service:

```bash
# 1. Provision a clean, empty target volume
docker volume create db-data-restored

# 2. Extract the archive into the target volume using an ephemeral worker
docker run --rm \
  --mount type=volume,source=db-data-restored,target=/target \
  --mount type=bind,source=/var/backups,target=/backup,readonly \
  alpine:latest \
  tar xzf /backup/db-data-snapshot.tar.gz -C /target

# 3. Attach the restored volume to the new service container
docker run -d --name db-service \
  --mount type=volume,source=db-data-restored,target=/var/lib/postgresql/data \
  postgres:16-alpine
```

---

## The Non-Root Host UID/GID Permission Trap

In Chapter 10, you learned that production containers must run as a non-root user (e.g., `USER 10001:10001`). However, non-root execution creates a notorious operational failure when combined with host bind mounts:

```text
Host Directory: /home/student/logs (Owned by UID 1000:1000, 0755)
                                ▲
                                │ Bind Mount
                                ▼
Container Process: appuser (UID 10001) ──► Attempts to write /var/log/app.log
Result: EACCES: Permission Denied!
```

### Why This Happens
The Linux kernel enforces file permissions based on the numeric **UID** and **GID** making the syscall. Because containers share the host kernel:
- If a host directory is owned by UID `1000` with permissions `rwxr-xr-x`, a process running as UID `10001` inside the container is classified as "others" and cannot write to it.

### How to Resolve It
1. **Pre-assign ownership on the host:**
   ```bash
   mkdir -p ./logs
   sudo chown -R 10001:10001 ./logs
   ```
2. **Leverage Docker Named Volumes:**
   When a named volume is mounted into a container for the first time, Docker automatically initializes directory ownership to match the container's `USER` directive! This is a primary reason named volumes are vastly preferred over bind mounts in production.

---

## Ephemeral In-Memory Storage (`tmpfs`)

For sensitive data (API credentials, temporary decryption keys) or high-throughput scratch files that should never persist on physical storage:

```bash
docker run -d --name api-worker \
  --mount type=tmpfs,target=/app/secure-tokens,tmpfs-size=32m,tmpfs-mode=0700 \
  alpine:latest sleep 300
```

- Data exists exclusively in the host kernel's virtual memory page cache.
- The instant the container terminates, all data is destroyed without leaving residual blocks on NVMe or SSD disks.

---

## Summary Checklist

| Objective | Production Best Practice |
|:---|:---|
| **Backups** | Use ephemeral utility containers with `readonly` source volume mounts. |
| **Restore** | Unpack archives into a newly provisioned volume before starting the application service. |
| **Security** | Run as non-root (`10001`) and ensure volume/host directory ownership matches the numeric UID. |
| **Secrets** | Mount sensitive session state and ephemeral tokens into `tmpfs` RAM mounts. |
