# Lab 14: Stateful Database Persistence & Volume Operations Assessment

## Scenario

You are tasked with deploying a stateful caching tier for an inventory microservice. Unlike stateless application containers, stateful databases require deterministic persistence: transactional writes must survive container crashes, planned redeployments, and host restarts.

Your assignment is to provision an isolated named Docker volume, attach it to a database container, commit critical transactional state, simulate catastrophic container destruction, and prove complete data recovery using a newly deployed container instance.

This is an independent assessment. You are given operational constraints and acceptance criteria; you must determine the appropriate Docker CLI commands, mount syntax, and database commands to satisfy the contract.

---

## Operational Specifications & Contract

### 1. Volume Provisioning
- Volume Name: `inventory-db-data`
- Driver: Standard `local` volume driver.

### 2. Primary Database Service
- Container Name: `db-primary`
- Base Image: `redis:alpine`
- Lifecycle: Must run in detached mode (`-d`) and remain active in the background.
- Storage Mount: The named volume `inventory-db-data` must be mounted at container path `/data`.

### 3. Transactional State Commitment
- Key-Value Record:
  - Key: `SYS_CHECK`
  - Value: `PERSISTENCE_ACTIVE_2026`
- Persistence: The state must be committed to disk storage within the volume.

### 4. Destruction Drill
- Terminate and forcefully delete `db-primary`.
- Verify the container no longer exists on the engine while preserving the `inventory-db-data` volume.

### 5. Service Recovery & Verification
- Container Name: `db-recovery`
- Base Image: `redis:alpine`
- Lifecycle: Must run in detached mode (`-d`) and remain active in the background.
- Storage Mount: Attach the existing `inventory-db-data` volume at `/data`.
- Verification: Querying the key `SYS_CHECK` must successfully retrieve `PERSISTENCE_ACTIVE_2026`.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Volume Creation** | `inventory-db-data` exists as a local Docker volume. |
| **Primary Deployment** | `db-primary` is running with `inventory-db-data` mounted at `/data`. |
| **State Persistence** | Key `SYS_CHECK` holds `PERSISTENCE_ACTIVE_2026` inside the database. |
| **Disaster Simulation** | `db-primary` is deleted while `inventory-db-data` is preserved. |
| **State Recovery** | `db-recovery` mounts `inventory-db-data` and successfully returns the stored record. |
