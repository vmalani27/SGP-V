# Lab 15: Automated Backup & Disaster Recovery Assessment

## Scenario

Stateful container systems require battle-tested operational runbooks for backup automation and disaster recovery. Storing backups within the application container itself violates security and architectural standards; instead, production engineering relies on stateless, ephemeral utility containers to generate atomic snapshots and restore state upon volume corruption. Furthermore, volatile session keys and authentication tokens must be confined to in-memory filesystems (`tmpfs`) to prevent sensitive data from persisting on disk.

Your objective is to populate a production storage volume, execute an automated backup snapshot using an ephemeral utility container, simulate catastrophic storage destruction, restore the dataset into a fresh volume, verify data integrity, and configure volatile in-memory storage for sensitive credentials.

This is an independent assessment. You are given operational constraints and acceptance criteria; you must determine the appropriate Docker CLI commands, mount syntax, and archive parameters to satisfy the contract.

---

## Operational Specifications & Contract

### 1. Primary Volume Seeding
- Volume Name: `prod-records`
- Payload: Create `/data/data.csv` inside the volume containing:
  ```text
  id,name,balance
  1,alpha,500
  2,beta,1200
  ```

### 2. Ephemeral Backup Automation
- Host Archive Location: `~/backups/prod-records-backup.tar.gz`
- Execution Method: Must be executed via an ephemeral utility container (`alpine:latest`) that mounts `prod-records` as `readonly`.
- Output: A valid gzip-compressed archive containing `data.csv`.

### 3. Destruction Drill
- Purge and completely delete the `prod-records` volume from the Docker engine to simulate catastrophic volume loss.

### 4. Disaster Recovery Restoration
- Target Volume Name: `restored-records`
- Execution Method: Restore the archive `~/backups/prod-records-backup.tar.gz` into `restored-records` using an ephemeral utility container.
- Verification: Confirm that `data.csv` inside `restored-records` matches the original dataset.

### 5. Volatile Security Storage (`tmpfs`)
- Container Name: `secure-cache`
- Base Image: `alpine:latest`
- Lifecycle: Run in detached mode (`sleep 300`).
- Storage Mount: Attach an in-memory `tmpfs` mount at `/app/secrets` with a maximum size limit of `32m`.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Volume Seeding** | `prod-records` exists and contains `data.csv`. |
| **Ephemeral Backup** | `~/backups/prod-records-backup.tar.gz` exists and contains `data.csv`. |
| **Disaster Simulation** | `prod-records` is deleted from Docker. |
| **Recovery Runbook** | `restored-records` is provisioned and contains the restored dataset. |
| **Volatile tmpfs Mount** | `secure-cache` is running with a `tmpfs` mount at `/app/secrets`. |
