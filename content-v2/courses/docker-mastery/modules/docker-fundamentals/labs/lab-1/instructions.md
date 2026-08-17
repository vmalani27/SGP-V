# Lab 1: Hello World Container — Docker Command Line Basics

## What You're Doing and Why

This lab is not about building anything complicated — it's about getting comfortable with the Docker command line. Every skill you learn later in this course (images, containers, networking, Compose) is driven from the CLI. Before you can do any of that, you need to confirm Docker is working, see what images are already on your system, and run your very first container. This is the "hello world" of containers.

## Background

Docker is a client-server application. The `docker` command you type is the client; it talks to a background daemon that actually manages images, containers, and networks. When you run a container, Docker first checks whether the image exists locally. If it does not, it pulls it from Docker Hub, the default public registry. An image is a read-only filesystem snapshot. A container is a running instance of that image with an isolated writable layer on top. You can run several containers from the same image at once and they will not interfere with each other.

## Command Reference

### `docker version`

Shows client and daemon versions — a quick way to confirm the CLI can talk to the daemon.

### `docker ps`

Lists running containers. Add `-a` to include stopped ones.

### `docker images`

Lists the images stored locally, with their tags, sizes, and creation dates.

### `docker run <image>`

Creates and starts a container from the specified image.

### `docker start <name-or-id>`

Starts an existing, stopped container again.

### `docker stop <name-or-id>`

Stops a running container gracefully.

### `docker rm <name-or-id>`

Removes a stopped container.

## Scenario

Your environment comes with Docker installed, but it is not reachable by your user yet. The tasks walk you through confirming that Docker refuses your connection, granting your user access to the daemon, seeing what images are already on the system, and running your very first container — one that prints a greeting.

## Objective

Run `docker ps` and confirm Docker refuses the connection. Add your user to the docker group so Docker commands work. List the local images with `docker images`. Then run a container named `alpine-container` from `alpine:latest` that prints the greeting `GREETING_FROM_ALPINE`, and confirm the greeting in its logs.

## Tasks

- [ ] **access-daemon** — Run `docker ps` and confirm the daemon refuses your connection.
- [ ] **fix-group** — Add your user to the docker group, then verify with `getent group docker`.
- [ ] **count-images** — Run `docker images` and count how many images are stored locally.
- [ ] **run-simple-container** — Run a container named `alpine-container` that prints `GREETING_FROM_ALPINE`, then check `docker logs alpine-container` to confirm the greeting.

## Reflection

You just used the commands that show up in almost every Docker workflow: `ps` to see what's running, `images` to see what's cached, and `run` to start something. Nothing you ran modified your machine — the container ran in isolation and vanished when you removed it. That isolation is one of the most important properties of containers.
