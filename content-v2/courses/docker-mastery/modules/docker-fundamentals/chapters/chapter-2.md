# Chapter 2: Container Lifecycle

## The Disappearing Container

You receive an alert that your web service is down. You SSH into the server and run:

```bash
docker ps
```

The list is empty. 

Did the container crash? Was it ever started? Did someone delete it?

Understanding container lifecycle states and the commands used to triage them is the difference between blindly restarting containers and actually diagnosing what went wrong.


## 1. The Container Lifecycle

A container is not a virtual machine — it is an isolated process running on the host kernel. It moves through four primary lifecycle states:

| State | What it means | What remains |
|---|---|---|
| **Created** | Docker has allocated the container configuration and filesystem, but the process has not started. | The container metadata and writable layer exist. |
| **Running** | The container's primary process is executing. | The container and its writable layer are active. |
| **Exited** | The primary process terminated voluntarily, failed, or was stopped by Docker. | The container metadata and writable layer remain on disk. |
| **Removed** | Docker deleted the container. | The container metadata and writable layer are gone permanently. |

### Basic commands

Start a new container

```bash
docker run -d --name web-service alpine:latest sleep 300
```

- `-d`: Runs detached in the background.
- `--name web-service`: Assigns a name which can be used to reference the container

Stop the container:
```bash
docker stop web-service
```

Resume the stopped container:
```bash
docker start web-service
```

Delete the container:

```bash
docker rm web-service
```
*(Note: A container must be stopped before it can be removed.)*

However, if you use the -f flag with rm, it forces docker to terminates the running container's main process and then removes it, without having to use docker stop first:

```bash
docker rm -f web-service
```

## 2. Visibility: Why `docker ps` Isn't Enough

The most common beginner mistake is assuming a container doesn't exist because `docker ps` returned nothing.

- **`docker ps`** displays **only running containers**.
- **`docker ps -a`** displays **all containers**, including stopped and crashed ones.

```bash
docker ps -a
```

### Reading the Status and Exit Codes

When inspecting the output of `docker ps -a`, pay attention to the `STATUS` column:

| Status | Meaning |
|---|---|
| **`Up 10 minutes`** | The container is currently running. |
| **`Exited (0) 2 minutes ago`** | The process exited cleanly with success. |
| **`Exited (1) 2 minutes ago`** | The process exited due to an application error or uncaught exception. |
| **`Exited (137) 2 minutes ago`** | The process was forcefully killed (`SIGKILL`), often because of an Out-Of-Memory (OOM) event or `docker kill`. |

## 3. The Container Crash Inspection Routine

When a container stops unexpectedly, do not blindly delete or restart it. Follow this 3-step investigation routine:

### Step 1: Check the Exit State
Verify whether the container exists and note its exit code:

```bash
docker ps -a --filter "name=web-service"
```

If it exited with a non-zero code, something must have failed during execution.

### Step 2: Read the Output Logs (`docker logs`)
Docker captures `stdout` and `stderr` emitted by the container's main process:

```bash
docker logs web-service
```

Common helpful flags:
- `docker logs --tail 50 <name>`: View only the last 50 lines.
- `docker logs -f <name>`: Stream logs in real-time.

For crashed containers, `docker logs` is where you will find fatal stack traces, failed database connections, or missing configuration errors.

### Step 3: Inspect Container Details (`docker inspect`)
`docker inspect` returns the daemon's internal state for that container in JSON format:

```bash
docker inspect web-service
```

Look for the `.State` block in the output:
- **`Status`**: `running`, `exited`, etc.
- **`ExitCode`**: The exact numerical return code.
- **`OOMKilled`**: `true` points to if the kernel killed the container due to high memory usage
- **`FinishedAt`**: Timestamp when the process died.



## 4. Container Hygiene & Cleanup

Every stopped container retains its filesystem layer on your host disk. If you run dozens of test containers daily without removing them, disk usage accumulates quickly.

Clean up a specific stopped container:

```bash
docker rm web-service
```

Remove all stopped containers in one step:

```bash
docker container prune -f
```



## Key Takeaways

1. **Containers are processes**: When the main process exits, the container stops.
2. **`docker ps` vs `docker ps -a`**: If a container isn't running, `docker ps` hides it. Always check `docker ps -a`.
3. **The Inspection Loop**:
   - `docker ps -a` $\rightarrow$ Did it exit? What code?
   - `docker logs` $\rightarrow$ What did it output before dying?
   - `docker inspect` $\rightarrow$ Did it get OOM killed or misconfigured?
4. **Clean up after yourself**: Use `docker rm` or `docker container prune` to reclaim host disk space from exited containers.
