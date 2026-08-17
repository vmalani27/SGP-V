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
docker run -d --name sleeper alpine:latest sleep 300
```

`-d` runs it in the background (detached mode) so your terminal stays free, and `--name sleeper` gives it a name you can refer to. `docker run` is the command you will use for every deployment in this course.

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

## Names and IDs

Every container has a unique ID (a long hash) and a name. If you do not pass `--name`, Docker invents one from an adjective and a noun — something like `brave_goldberg`. You can use the name or the first few characters of the ID wherever a command expects a container.

Names must be unique among existing containers. If you `docker run --name sleeper` again while a container named `sleeper` still exists, Docker refuses — remove the old one first, or pick a different name.

## Reading a Container's Configuration: docker inspect

Docker records everything about a container — the image it was created from, the environment variables it was given, the command it runs, and its current state. Read it back as JSON:

```
docker inspect <name-or-id>
```

The output is large, so target the part you want. The `--format` flag selects a single field with a Go template:

```
docker inspect sleeper --format '{{.Config.Image}}'
# alpine:latest

docker inspect sleeper --format '{{.Config.Cmd}}'
# [sleep 300]

docker inspect sleeper --format '{{.State.Status}}'
# running
```

Or pipe the full JSON through `grep` to find a section, such as the environment variables in `Config.Env`.

## Reading a Container's Output: docker logs

Containers are usually configured to print what they are doing. See what a container has written to its output:

```
docker logs <name-or-id>
```

This works on exited containers too — it is often the only way to find out what a container did before it stopped. To follow logs in real time (like `tail -f`), add `-f`; press `Ctrl+C` to stop following. The container keeps running.

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

See the lifecycle in action — click each command below to load it into the terminal, then press Enter to run it. Watch the container move through its states:

:::terminal-demo
id: container-lifecycle
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
examples:
  - docker run -d --name demo alpine:latest sleep 300
  - docker ps
  - docker inspect demo --format '{{.Config.Cmd}}'
  - docker stop demo
  - docker ps -a
  - docker start demo
  - docker inspect demo --format '{{.State.Status}}'
  - docker rm -f demo
  - docker ps -a
:::

> **Warning:** Do not let stopped containers pile up. Run `docker ps -a` periodically and remove containers you no longer need with `docker rm` — stopped containers still consume disk space.

> **Try This:** Run `docker run -d --name demo alpine:latest sleep 300`, then `docker ps` to see it running. Read its configuration with `docker inspect demo --format '{{.Config.Cmd}}'`. Stop it with `docker stop demo` and check `docker ps -a` — it is now Exited. Start it again with `docker start demo`, confirm with `docker inspect demo --format '{{.State.Status}}'`, then remove it with `docker rm demo` and verify it is gone with `docker ps -a`.

## Key Takeaways

- `docker run` creates and starts a container; `--name` gives it a name to manage it by
- `docker ps` lists running containers; `docker ps -a` lists all containers, including exited ones
- `docker inspect` reads a container's full configuration as JSON
- `docker logs` shows what a container has written — including exited containers
- `docker stop` pauses a container, `docker start` resumes the same one, `docker rm` deletes it
