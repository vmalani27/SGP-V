# Lab 2: Inspecting Containers

## What You're Doing and Why

Before you configure anything, you need to be able to see what already exists and how it is put together. This lab drops a mystery container into your environment and asks you to investigate it: what is running, what image it came from, what configuration it carries, what command it runs, and what it has been doing. Along the way you will use the two commands every developer reaches for when something goes wrong — `docker inspect` to read a container's full configuration and `docker logs` to see what it has written — and you will exercise the container lifecycle: stop, start, and remove.

## Background

A container is a running instance of an image, and it carries its own configuration: which image it was created from, what environment variables were passed to it, what command it runs, and how it is currently faring. Docker records all of this, and `docker inspect` lets you read it back as JSON. `docker logs` shows everything the container has written to its output streams. And because containers are designed to be disposable, you can stop, start, and remove them — stopping is a pause, removing is a deletion.

## Command Reference

### `docker ps` / `docker ps -a`

Lists running containers, or all containers including ones that have exited. Each entry shows the container's ID, image, and name.

### `docker inspect <name-or-id>`

Prints the full JSON configuration of a container: the image, environment variables, command, network settings, mounts, and state. Pipe it through `grep` to find specific values, or use `--format '{{.Config.Image}}'` to select one field.

### `docker logs <name-or-id>`

Prints everything a container wrote to its output streams. Add `-f` to follow in real time, like `tail -f`.

### `docker stop` / `docker start` / `docker rm`

Stops a running container, resumes a stopped one (the same container — no new ID), and deletes a container. Removing a container destroys its writable layer.

## Scenario

Two containers have been created in your environment before you started: `mystery`, a running container, and `expired`, a container that ran once and exited. Use the inspection commands to find out everything about them, then bring the `mystery` container through its lifecycle yourself.

## Objective

Identify the running container with `docker ps` and count all containers with `docker ps -a`. Use `docker inspect mystery` to find its image, its `MYSTERY_FLAVOR` environment variable, and the command it is running. Use `docker logs expired` to read what it printed. Then stop the `mystery` container, start it again, and finally remove it.

## Tasks

- [ ] **find-running** — Run `docker ps` and identify the running container the lab started.
- [ ] **count-all** — Run `docker ps -a` and count every container on the system.
- [ ] **find-image** — Inspect `mystery` and read which image it was created from.
- [ ] **find-env** — Inspect `mystery` and read the value of `MYSTERY_FLAVOR`.
- [ ] **find-cmd** — Inspect `mystery` and read the command it is running.
- [ ] **view-logs** — Run `docker logs expired` and read what it printed.
- [ ] **stop-container** — Stop `mystery`; `docker ps -a` should show it as Exited.
- [ ] **start-container** — Start `mystery`; `docker ps` should show it running again.
- [ ] **remove-container** — Remove `mystery`; `docker ps -a` should no longer list it.

## Reflection

`docker ps` and `docker ps -a` tell you what exists and what state it is in; `docker inspect` tells you exactly how a container is configured; `docker logs` tells you what it has been doing. Together they are your primary tools for understanding and debugging containers. Stopping, starting, and removing are three separate operations — stopping pauses a container, starting resumes the same one, and only removing destroys it along with its writable layer.
