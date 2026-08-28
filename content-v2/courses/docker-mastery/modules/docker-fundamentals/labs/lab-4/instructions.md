# Lab 4: Container Data and Persistence

## What You're Doing and Why

By now you know how to run, inspect, and configure containers. This lab is about what happens to a container's **data**. You will watch a file survive a container being stopped and started, disappear when the container is removed, come back via a Docker volume, and finally survive in a directory you mount from the lab environment. Along the way you will answer the three questions that matter: where is this container's data coming from, is it in the writable layer or in mounted storage, and what happens to it if I remove the container?

## Background

Every container has a writable layer that is private to it. Stopping a container keeps that layer; removing the container destroys it; a new container from the same image starts with a fresh one. Container writes never change the image. Storage that must outlive a container lives outside it: a **volume** is Docker-managed storage with its own lifecycle, and a **bind mount** is a directory you provide on the lab environment.

## Command Reference

### `docker run -d --name <name> -v VOLUME:/path <image> sleep 300`

Runs a container in the background with a Docker volume mounted at a path.

### `docker run --name <name> -v /absolute/path:/path <image> <command>`

Runs a container with a directory from the lab environment mounted at a path (a bind mount).

### `docker exec <name> <command>`

Runs a command inside a running container — your way to create and check files.

### `docker stop` / `docker start` / `docker rm`

Pause a container, resume the same one, or delete it and its writable layer.

### `docker volume create` / `docker volume ls` / `docker volume inspect` / `docker volume rm`

Manage volumes, which exist independently of containers.

### `docker inspect <name> --format '{{.Mounts}}'`

Shows every mount: its `Type` (volume or bind), `Source`, `Destination`, and read/write status.

## Scenario

You follow a file through every stage of the container lifecycle, then store it in two kinds of persistent storage and compare them.

## Tasks

- [ ] **create-data** — Start a background `data-demo` container from `alpine`.
- [ ] **create-file** — Create `/data/hello.txt` containing `persist` inside it.
- [ ] **stop-demo** — Stop `data-demo`; `docker ps -a` shows it as Exited.
- [ ] **start-demo** — Start it again; `/data/hello.txt` still exists.
- [ ] **recreate-demo** — Remove it, run a fresh one from the same image; the file is gone.
- [ ] **image-unmodified** — Confirm `alpine:latest`'s ID is unchanged from the start.
- [ ] **volume-create** — Create the `my-data` volume.
- [ ] **volume-write** — Run `writer` with `my-data` at `/data`; write the file through the volume.
- [ ] **volume-recreate** — Remove `writer`, run `reader` with the same volume; the file is back.
- [ ] **volume-persists** — Remove `reader`; `my-data` still exists.
- [ ] **volume-rm** — Remove `my-data`; it is gone.
- [ ] **bind-mount** — Bind-mount `/home/student/shared` at `/data` in `binder`; the file appears on the lab environment.
- [ ] **bind-persists** — Remove `binder`; the file remains on the lab environment.
- [ ] **inspect-mounts** — Identify the `Mounts` field that distinguishes a volume from a bind mount.

## Reflection

Stopping a container keeps its writable layer; removing it destroys the layer; a new container from the same image starts fresh — and none of this touches the image itself. Data that must survive belongs outside the container, in a volume (Docker manages the location) or a bind mount (you provide the path). Removing a container never removes the volumes it used — only `docker volume rm` does. Inspection is what ties it together: `docker inspect`'s `Mounts` section shows you exactly where each piece of a container's data comes from.
