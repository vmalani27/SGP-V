# Chapter 2: Containers

## In this chapter, you will

- Run a container and manage it by name or ID
- List containers with `docker ps` and `docker ps -a`
- Read a container's configuration with `docker inspect`
- Read a container's output with `docker logs`
- Move a container through its lifecycle: stop, start, restart, remove

## Running a Container

Chapter 1 covered the architecture; here we focus on the commands. `docker run <image>` does two things at once: it **creates** a container from the image and **starts** it. You already used it in Lab 1:

```
docker run --name alpine-container alpine:latest echo GREETING_FROM_ALPINE
```

That container printed a greeting and exited. A container that finishes its command stops on its own — but it still exists until you remove it.

To have something to work with, start a container that keeps running. Alpine's `sleep` command holds it open:

```
docker run -d --name demo alpine:latest sleep 300
```

`-d` runs it in the background (detached mode) so your terminal stays free, and `--name demo` gives it a name you can refer to. `docker run` is the command you will use for every deployment in this course.

Try it — the steps below load each command into the terminal for you. Click **Run this next**, review the command, then press Enter:

:::terminal-demo
id: container-lifecycle
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
state:
  label: demo container
  command: docker inspect -f '{{.State.Status}}' demo 2>/dev/null || echo "not created"
steps:
  - id: create-demo
    label: Create and start the container
    run: docker run -d --name demo alpine:latest sleep 300
    expect: |
      A long alphanumeric container ID is printed on its own line. The container is now running in the background — watch the state chip turn to `running`.
  - id: ps-demo
    label: Confirm it is running
    run: docker ps
    expect: |
      A row for `demo` with image `alpine:latest`, command `sleep 300`, and status `Up` (or `Up N seconds`).
:::

## Listing Containers: docker ps

### What Is Running

```
docker ps
```

Lists the containers currently running — their IDs, the image they came from, the command they are running, their status, and (once you learn port mapping) their published ports.

### Everything, Including Stopped

```
docker ps -a
```

Adds containers that have exited. Every container you have created appears here until you remove it — including the one from Lab 1. Containers that exited are not gone; they are just not running.

Run both against the `demo` container you just created:

:::terminal-demo
id: container-lifecycle
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: ps-running
    label: List what is running
    run: docker ps
    expect: |
      The `demo` container appears with status `Up`. Only running containers show up here.
  - id: ps-all
    label: Include stopped containers
    run: docker ps -a
    expect: |
      The same `demo` row — plus anything that has exited, including the greeting container from Lab 1. Every container you have created appears here.
:::

## Names and IDs

Every container has a unique ID (a long hash) and a name. If you do not pass `--name`, Docker invents one from an adjective and a noun — something like `brave_goldberg`. You can use the name or the first few characters of the ID wherever a command expects a container.

Names must be unique among existing containers. If you `docker run --name demo` again while a container named `demo` still exists, Docker refuses — remove the old one first, or pick a different name. See for yourself:

:::terminal-demo
id: container-lifecycle
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: duplicate-name
    label: Try to reuse the name demo
    run: docker run --name demo alpine:latest sleep 300
    expect: |
      Docker refuses with `Error response from daemon: Conflict. The container name "/demo" is already in use by container`. Names must be unique among existing containers.
  - id: clean-after-error
    label: Check nothing was created
    run: docker ps -a
    expect: |
      The `demo` container is still there from before — the failed run did not create a duplicate.
:::

## Reading a Container's Configuration: docker inspect

Docker records everything about a container — the image it was created from, the environment variables it was given, the command it runs, and its current state. Read it back as JSON:

```
docker inspect <name-or-id>
```

The output is large, so target the part you want. The `--format` flag selects a single field with a Go template. Ask the `demo` container what it is made of and what it is doing:

:::terminal-demo
id: container-lifecycle
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: inspect-image
    label: Read which image it came from
    run: docker inspect demo --format '{{.Config.Image}}'
    expect: |
      `alpine:latest` — the image the `demo` container was created from.
  - id: inspect-cmd
    label: Read the command it runs
    run: docker inspect demo --format '{{.Config.Cmd}}'
    expect: |
      `[sleep 300]` — the command the container is running.
  - id: inspect-status
    label: Read its current state
    run: docker inspect demo --format '{{.State.Status}}'
    expect: |
      `running` — the container's current state.
:::

Or pipe the full JSON through `grep` to find a section, such as the environment variables in `Config.Env`.

## Reading a Container's Output: docker logs

Containers are usually configured to print what they are doing. See what a container has written to its output:

```
docker logs <name-or-id>
```

This works on exited containers too — it is often the only way to find out what a container did before it stopped. To follow logs in real time (like `tail -f`), add `-f`; press `Ctrl+C` to stop following. The container keeps running.

Create a container that prints a message, then read its logs:

:::terminal-demo
id: container-lifecycle
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: run-logger
    label: Create a container that prints a message
    run: docker run --name logger alpine:latest echo HELLO_FROM_LOGGER
    expect: |
      The container runs to completion and prints `HELLO_FROM_LOGGER` — then it exits on its own.
  - id: logs-logger
    label: Read what it printed
    run: docker logs logger
    expect: |
      `HELLO_FROM_LOGGER`. Logs work even though the container already exited.
  - id: logs-demo
    label: Read the sleeper's output
    run: docker logs demo
    expect: |
      Nothing — the `demo` container is busy sleeping and has not printed anything yet. Output only exists if the app wrote it.
  - id: rm-logger
    label: Remove the logger container
    run: docker rm logger
    expect: |
      `logger` is echoed — the container is gone. (You cannot remove a running container without `-f`.)
:::

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

Watch the container move through its states — the chip in the header tracks `demo` live as you go:

:::terminal-demo
id: container-lifecycle
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
state:
  label: demo container
  command: docker inspect -f '{{.State.Status}}' demo 2>/dev/null || echo "not created"
steps:
  - id: locate-demo
    label: Find the demo container
    run: docker ps -a
    expect: |
      A row for `demo` — running, or `Exited` if its 300-second `sleep` ran out. Either way it still exists. If there is no row at all, run the create step on the "Running a Container" slide first.
  - id: stop-demo
    label: Stop it
    run: docker stop demo
    expect: |
      Docker echoes `demo` and sends SIGTERM. The state chip flips to `exited`. If the container had already stopped, Docker just reports it is not running — that is the same state.
  - id: see-stopped
    label: See it as Exited
    run: docker ps -a
    expect: |
      The `demo` row now shows `Exited (0)` — it is stopped but not gone.
  - id: start-demo
    label: Resume it
    run: docker start demo
    expect: |
      Docker echoes `demo`. The state chip flips back to `running` — it is the *same* container with the same ID, just resumed.
  - id: confirm-running
    label: Confirm it is running again
    run: docker inspect demo --format '{{.State.Status}}'
    expect: |
      `running` — the container came back with its original configuration intact.
  - id: remove-demo
    label: Remove it
    run: docker rm -f demo
    expect: |
      Docker echoes `demo` — the container is deleted, and the state chip reads `not created`.
  - id: verify-gone
    label: Verify it is gone
    run: docker ps -a
    expect: |
      No row for `demo` at all. The container no longer exists.
:::

> **Warning:** Do not let stopped containers pile up. Run `docker ps -a` periodically and remove containers you no longer need with `docker rm` — stopped containers still consume disk space.

## Key Takeaways

- `docker run` creates and starts a container; `--name` gives it a name to manage it by
- `docker ps` lists running containers; `docker ps -a` lists all containers, including exited ones
- `docker inspect` reads a container's full configuration as JSON
- `docker logs` shows what a container has written — including exited containers
- `docker stop` pauses a container, `docker start` resumes the same one, `docker rm` deletes it