# Chapter 4: Process Lifecycle, Signals & Resilience

## Process Lifecycle and Signals

When Docker starts a container, the entrypoint command runs inside an isolated PID namespace as **PID 1**.

In Linux, the kernel communicates lifecycle events to processes using signals. Docker primarily relies on two termination signals delivered directly to PID 1:

| Signal | Number | Catchable? | Delivery Mechanism |
| :--- | :---: | :---: | :--- |
| **`SIGTERM`** | 15 | **Yes** | Sent by `docker stop`. Requests a graceful shutdown so the application can finish in-flight requests, flush buffers, and close connections. |
| **`SIGKILL`** | 9 | **No** | Sent by `docker kill` or after the `docker stop` timeout. Instructs the kernel to terminate the process immediately; no application code can run. |

`docker stop <container>` sends `SIGTERM` to PID 1 and starts a grace period timer (default: 10 seconds). If the process terminates within that window, the container exits cleanly. If the process does not terminate before the timer expires, Docker issues `SIGKILL` to force termination. You can adjust the grace period using the `-t` flag (for example, `docker stop -t 30 <container>`).

In contrast, `docker kill <container>` bypasses the grace period and sends `SIGKILL` immediately.

## Shell Form vs. Exec Form

In a Dockerfile, `CMD` and `ENTRYPOINT` can be written in two distinct syntaxes:

* **Exec form (preferred):**
  ```dockerfile
  CMD ["python", "server.py"]
  ```
  Docker executes `python server.py` directly without a wrapper. Python runs as **PID 1** inside the container.

* **Shell form and wrapper scripts:**
  ```dockerfile
  CMD ["/bin/sh", "entrypoint.sh"]
  ```
  The shell runs as **PID 1**, and Python runs as a child process under the shell.

The distinction matters during shutdown: standard Linux shells do not forward received signals like `SIGTERM` to child processes by default. If the process at PID 1 does not forward or handle the signal, the application never learns that a shutdown was requested.

> [!NOTE]
> In minimal images like Alpine Linux, BusyBox `/bin/sh` includes an internal optimization that automatically invokes `exec` on simple single commands passed via `sh -c "command"`. However, shell scripts (`entrypoint.sh`), multi-command chains, and shells like `bash` or Debian/Ubuntu's `dash` do not do this—they keep the shell at PID 1, isolating child processes from OS signals.

If an entrypoint script is necessary to prepare configuration before launching the application, use the shell builtin `exec`:

```bash
#!/bin/sh
echo "Preparing configuration..."
exec python server.py
```

`exec` replaces the shell process with the target application, allowing it to inherit PID 1 and receive signals directly.

## Terminal Experiment: Observing Signal Delivery

A practice directory is pre-configured at `~/process-demo`. It contains a Python application with a registered `SIGTERM` handler, a startup wrapper script, and two Dockerfiles:

* `Dockerfile.shell`: runs a shell wrapper script (`CMD ["/bin/sh", "entrypoint.sh"]`)
* `Dockerfile.exec`: starts the application via exec form (`CMD ["python", "server.py"]`)

### 1. Inspect the Demo Files

```bash
cd ~/process-demo
cat server.py
cat entrypoint.sh
```

`server.py` installs a signal handler for `SIGTERM`:

```python
def on_term(signum, frame):
    print("Caught SIGTERM! Performing graceful shutdown...", flush=True)
    sys.exit(0)

signal.signal(signal.SIGTERM, on_term)
```

`entrypoint.sh` starts Python without `exec`:

```sh
#!/bin/sh
python server.py
```

### 2. Build Both Images

```bash
docker build -t app-shell -f Dockerfile.shell .
docker build -t app-exec -f Dockerfile.exec .
```

### 3. Run and Compare Process Trees

Start both containers in the background:

```bash
docker run -d --name c-shell app-shell
docker run -d --name c-exec app-exec
```

Inspect the processes running inside each container:

```bash
docker top c-shell
docker top c-exec
```

Observe which command occupies PID 1 in each container.

### 4. Stop Both Containers and Compare Timing

Measure the shutdown duration for each container:

```bash
time docker stop c-shell
time docker stop c-exec
```

### 5. Inspect Exit Codes and Output

```bash
docker inspect c-shell --format 'ExitCode: {{.State.ExitCode}}'
docker logs c-shell

docker inspect c-exec --format 'ExitCode: {{.State.ExitCode}}'
docker logs c-exec
```

**What the evidence shows:**

* `c-shell` took approximately 10 seconds to stop, printed no shutdown log, and returned exit code `137`. The shell did not forward `SIGTERM` to Python, forcing Docker to issue a `SIGKILL` once the 10-second grace period expired.
* `c-exec` stopped in milliseconds, logged its shutdown message, and returned exit code `0`. Python ran directly as PID 1, received `SIGTERM`, executed its cleanup handler, and exited cleanly.

Clean up the test containers:

```bash
docker rm c-shell c-exec
```

## Diagnosing Exit Codes

When a container stops, its exit status reflects how its primary process terminated:

| Exit Code | Classification | Meaning |
| :---: | :--- | :--- |
| **`0`** | Clean Exit | The application completed its task or handled a shutdown signal cleanly. |
| **`1 – 126`** | Application Error | The process exited due to an unhandled exception, syntax error, or general application failure. |
| **`137`** | Killed by `SIGKILL` (`128 + 9`) | The process was terminated immediately by `SIGKILL`. This occurs after a `docker stop` timeout, an explicit `docker kill`, or an Out-Of-Memory (OOM) kill by the host kernel. |
| **`143`** | Terminated by `SIGTERM` (`128 + 15`) | The process terminated upon receiving `SIGTERM` without overriding the exit code. |

To inspect an exited container's status:

```bash
docker inspect <container-name> --format 'Status: {{.State.Status}}, ExitCode: {{.State.ExitCode}}'
```

> [!NOTE]
> Exit code `137` indicates that the process received `SIGKILL`; it does not indicate why the signal was sent. Check `docker inspect <container-name> --format '{{.State.OOMKilled}}'` to verify whether the host kernel terminated the container due to memory limits.

## Restart Policies and Cleanup

By default, Docker does not restart containers when they exit. Use the `--restart` flag to configure automated recovery:

| Restart Policy | Behavior | Typical Use Case |
| :--- | :--- | :--- |
| **`no`** (Default) | Never restarts the container. | One-off commands, batch jobs, database migrations. |
| **`on-failure[:max]`** | Restarts only if the container exits with a non-zero code. | Services prone to transient startup failures. |
| **`unless-stopped`** | Restarts on failure or daemon reboot, unless explicitly stopped. | Standard web services and background workers. |
| **`always`** | Always restarts, even if manually stopped before a daemon reboot. | Critical host-level background services. |

Example:

```bash
docker run -d --name web-api --restart unless-stopped -p 8080:80 nginx:alpine
```

For one-off containers that should not linger after their task completes, use `--rm` to delete them automatically upon exit:

```bash
docker run --rm alpine:latest echo "Task complete"
```

## Key Takeaways

- **Signal Delivery:** `docker stop` sends `SIGTERM` to PID 1 and waits for a grace period before issuing `SIGKILL`; `docker kill` sends `SIGKILL` immediately.
- **Exec-Form Syntax:** Use the exec form (`CMD ["executable", "param"]`) or `exec` in shell entrypoints so the application runs as PID 1 and receives OS signals directly.
- **Interpreting Exit Codes:** Exit code `0` indicates clean completion; `137` indicates termination via `SIGKILL` (grace-period timeout, explicit kill, or OOM event); `143` indicates standard termination via `SIGTERM`.
