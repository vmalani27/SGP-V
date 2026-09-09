# Lab 4: Ephemeral Storage, Process Signals & Restart Policies Assessment

## Scenario

Production containers are ephemeral, stateless execution environments. Modifications made to a container's filesystem reside in a temporary Copy-on-Write layer that is destroyed whenever the container is removed. Furthermore, operations engineers must handle process termination signals, configure automated restart policies for service resilience, and perform routine garbage collection to prevent disk exhaustion.

Your objective is to inspect filesystem alterations in the writable layer, prove rootfs ephemerality across container recreation, evaluate process exit codes under signal termination, deploy a container with an automated restart policy, and reclaim disk space by pruning inactive containers.

This is an independent assessment. You are provided with operational constraints and acceptance criteria; you must determine the appropriate Docker CLI commands and flags to achieve the target state.

---

## Operational Specifications & Contract

### 1. Writable Layer & Filesystem Auditing
- Container Name: `ephemeral-worker`
- Base Image: `alpine:latest`
- Runtime Configuration: Run in detached mode (`sleep 300`).
- File Modifications: Inside the container, create a directory `/data` and write `/data/state.json` containing `{"active": true}`.

### 2. Ephemeral Destruction Drill
- Remove the running `ephemeral-worker` container.
- Launch a replacement container with the same name (`ephemeral-worker`) using `alpine:latest` in detached mode (`sleep 300`).
- Ensure that the previously created file `/data/state.json` does not exist in the new instance, proving that data does not survive container destruction.

### 3. Process Signals & Exit Codes
- Identify the standard Linux exit code recorded by Docker when a container process is terminated by the kernel via `SIGKILL` (signal 9) or the out-of-memory killer.

### 4. Automated Restart Policy
- Container Name: `resilient-worker`
- Base Image: `alpine:latest`
- Configuration: Run in detached mode (`sleep 300`).
- Restart Policy: Configure the container to restart `on-failure` with a maximum retry count of `3`.

### 5. Storage Hygiene & Garbage Collection
- Prune all stopped containers from the Docker engine so that zero exited containers remain on the host.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Writable Layer Audit** | `ephemeral-worker` has `/data/state.json` and changes appear in `docker diff`. |
| **Ephemeral Destruction** | Recreated `ephemeral-worker` starts with a fresh rootfs without `/data/state.json`. |
| **Exit Code Semantics** | Identify the exit code emitted upon forceful `SIGKILL` termination. |
| **Restart Policy** | `resilient-worker` has restart policy `on-failure:3`. |
| **Garbage Collection** | All stopped containers are pruned from the host. |
