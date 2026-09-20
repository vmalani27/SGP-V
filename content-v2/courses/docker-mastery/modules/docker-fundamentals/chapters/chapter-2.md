# Chapter 2: Containers

:::terminal-demo
id: container-lifecycle
image: labops-docker:latest
pre_pull:
  - alpine:latest
:::

## In this chapter, you will

- Run a container and manage it by name or ID
- List containers with `docker ps` and `docker ps -a`
- Read a container's configuration with `docker inspect`
- Read a container's output with `docker logs`
- Move a container through its lifecycle: stop, start, restart, remove

## Running a Container

Chapter 1 covered the architecture; here we focus on the commands. `docker run <image>` does two things at once: it **creates** a container from the image and **starts** it. You already used it in Lab 1:

```bash
docker run --name alpine-container alpine:latest echo GREETING_FROM_ALPINE
```

That container printed a greeting and exited. A container that finishes its command stops on its own — but it still exists until you remove it.

To have something to work with, start a container that keeps running. Alpine's `sleep` command holds it open:

```bash
docker run -d --name demo alpine:latest sleep 300
```

`-d` runs it in the background (detached mode) so your terminal stays free, and `--name demo` gives it a name you can refer to. `docker run` is the command you will use for every deployment in this course.

Try it — hover over any command block and click **Run** to execute it directly in the terminal, or copy and paste it into the prompt.

Confirm that the `demo` container is actively running:

```bash
docker ps
```

## Listing Containers: docker ps

### What Is Running

```bash
docker ps
```

Lists the containers currently running — their IDs, the image they came from, the command they are running, their status, and (once you learn port mapping) their published ports.

### Everything, Including Stopped

```bash
docker ps -a
```

Adds containers that have exited. Every container you have created appears here until you remove it — including the one from Lab 1. Containers that exited are not gone; they are just not running.

Run both against the `demo` container you just created to see the difference between active and exited states.

## Names and IDs

Every container has a unique ID (a long hash) and a name. If you do not pass `--name`, Docker invents one from an adjective and a noun — something like `brave_goldberg`. You can use the name or the first few characters of the ID wherever a command expects a container.

Names must be unique among existing containers. If you `docker run --name demo` again while a container named `demo` still exists, Docker refuses — remove the old one first, or pick a different name.

Try running a duplicate container with the same name:

```bash
docker run --name demo alpine:latest sleep 300
```

Docker will refuse with an error: `Conflict. The container name "/demo" is already in use by container`.

Confirm that the failed run did not create a duplicate container:

```bash
docker ps -a
```

## Reading a Container's Configuration: docker inspect

### Inspecting State & Metadata: `docker inspect`

`docker inspect` returns the low-level JSON configuration and runtime state maintained by the Docker daemon for a container or image.

```bash
docker inspect demo
```

The output document is divided into key top-level keys:

* `.State`: Execution status, exit codes, process PID, health check status.
* `.NetworkSettings`: Assigned IP addresses, gateway, open ports, bridge networks.
* `.HostConfig`: Resource constraints (CPU/memory limits), bind mounts, restart policies.
* `.Config`: Environment variables (`Env`), entrypoint, command, and working directory.

---

### Querying with Go Templates (`--format`)

Rather than piping unparsed JSON through text utilities, target values directly using Go template path expressions:

#### 1. Extract Runtime Status and PID

Query whether the container is running and its host process ID:

```bash
docker inspect --format '{{.State.Status}} (PID: {{.State.Pid}})' demo
```

#### 2. Query Network Configuration

Extract the assigned container IP address on the default bridge network:

```bash
docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' demo
```

#### 3. Pretty-Print Structured Subtrees

To inspect an entire complex block (such as environment variables or mount points) as clean JSON without dumping the whole schema, pipe through the `json` template function:

```bash
docker inspect --format '{{json .Config.Env}}' demo
```

## Reading a Container's Output: docker logs

Containers are usually configured to print what they are doing. See what a container has written to its output:

```bash
docker logs <name-or-id>
```

This works on exited containers too — it is often the only way to find out what a container did before it stopped. To follow logs in real time (like `tail -f`), add `-f`; press `Ctrl+C` to stop following. The container keeps running.

Create a container named `logger` that prints a message and exits:

```bash
docker run --name logger alpine:latest echo HELLO_FROM_LOGGER
```

Read what the container printed:

```bash
docker logs logger
```

Now try reading the logs of the `demo` sleeper container you started earlier:

```bash
docker logs demo
```

Nothing is printed — the `demo` container is busy sleeping and has not printed anything yet. Output only exists if the application wrote it.

Clean up the exited `logger` container:

```bash
docker rm logger
```

## The Lifecycle

A container exists from `docker run` until `docker rm`:

```
docker run    -->  Running  -->  docker stop  -->  Stopped  -->  docker start  -->  Running
  (creates)                  (SIGTERM)                    (resumes, same object)
                |                                                    |
                +--- docker rm (of a stopped container) ------------> Gone
```

- **`docker stop <name-or-id>`** — sends SIGTERM and gives the process ten seconds to shut down gracefully, then SIGKILL.
- **`docker start <name-or-id>`** — resumes a stopped container. It is the *same* container with the same ID — not a new one.
- **`docker restart <name-or-id>`** — stops and starts in one step.
- **`docker rm <name-or-id>`** — deletes a stopped container; `docker rm -f` stops and removes in one shot.

Work through the complete container lifecycle with the `demo` container:

#### 1. Check current status

```bash
docker ps -a
```

#### 2. Stop the container

```bash
docker stop demo
```

Docker echoes `demo` and sends SIGTERM. Check that its status changed to `Exited`:

```bash
docker ps -a
```

#### 3. Resume the container

```bash
docker start demo
```

The container is resumed with its original configuration and ID intact. Confirm it is running again:

```bash
docker inspect demo --format '{{.State.Status}}'
```

#### 4. Remove the container

Force-remove the running container:

```bash
docker rm -f demo
```

Verify that it has been completely removed:

```bash
docker ps -a
```

> **Warning:** Do not let stopped containers pile up. Run `docker ps -a` periodically and remove containers you no longer need with `docker rm` — stopped containers still consume disk space.

## Key Takeaways

- `docker run` creates and starts a container; `--name` gives it a name to manage it by
- `docker ps` lists running containers; `docker ps -a` lists all containers, including exited ones
- `docker inspect` reads a container's full configuration as JSON
- `docker logs` shows what a container has written — including exited containers
- `docker stop` pauses a container, `docker start` resumes the same one, `docker rm` deletes it