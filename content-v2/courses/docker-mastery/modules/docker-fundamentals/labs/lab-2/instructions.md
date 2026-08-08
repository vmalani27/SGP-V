# Lab 2: Inspecting and Configuring Containers

## What You're Doing and Why

A single image is meant to be reused in many situations — a personal blog, a company homepage, an API gateway. What changes is configuration. In this lab you will configure a web server at runtime with environment variables, then use the two commands every developer reaches for when something goes wrong: `docker inspect` to read a container's full configuration and `docker logs` to see what it has been doing. You will also see, hands-on, why containers are temporary by nature.

## Background

Containers receive their settings through environment variables — key-value pairs the application reads when it starts. The image provides the defaults, but you can turn the knobs when you run the container with the `-e` flag, without rebuilding anything. Docker records every setting you pass in the container's configuration, and `docker inspect` lets you read that configuration back as JSON. `docker logs` shows you what the container has written to its output streams. And because containers are designed to be disposable, anything a container writes to its own filesystem lives in that container's writable layer — and dies with it.

## Command Reference

### `docker run -d -p HOST:CONTAINER -e KEY=VALUE <image>`

Starts a container in the background (`-d`), maps a host port to a container port (`-p`), and sets an environment variable (`-e`).

### `docker inspect <name-or-id>`

Prints the full JSON configuration of a container: environment variables, network settings, mounts, resource limits, and state. Pipe it through `grep` to find specific values.

### `docker logs <name-or-id>`

Prints everything a container wrote to its output streams. Add `-f` to follow in real time, like `tail -f`.

### `docker stop` / `docker rm`

Gracefully stops a container and removes it. Removing a container destroys its writable layer — everything it wrote that was not in a volume.

## Scenario

Start an nginx web server in the background, configured with an environment variable and a published port. Inspect it to confirm your configuration took effect, read its startup logs, then destroy it and start a fresh one to prove that anything written inside a container disappears with it.

## Objective

Run `docker run -d --name web -p 8080:80 -e SITE_MODE=production nginx:alpine`. Use `docker inspect web` to verify `SITE_MODE=production` is in the container's Env. Use `docker logs web` to see the startup banner. Write a file inside `web`, stop and remove it, start a fresh container named `web2`, and confirm the file is gone.

## Reflection

Environment variables let you reconfigure an image without rebuilding it. `docker inspect` shows exactly what configuration a running container received, and `docker logs` tells you what it has been doing — together they are your primary debugging tools. Finally, you watched a container's data vanish along with it. That is intentional: containers are disposable by design, which is why anything that must survive lives in volumes (a later chapter in this course).
