# Lab 3: Configuring Containers

## What You're Doing and Why

In Lab 2 you inspected containers that already existed. Now it is your turn to create them. A container image is built once but should run in many situations, and the differences come from configuration you provide at runtime: environment variables, published ports, and the command the container runs. This lab has you create three containers from the same two Alpine images, each one configured differently, and prove that each configuration took effect.

## Background

Environment variables are key-value pairs that are visible to every process inside the container. They are set with the `-e` flag at runtime, and they override any defaults baked into the image. Port mapping with `-p HOST:CONTAINER` makes a container's port reachable from the host: `-p 9090:80` forwards host port 9090 to container port 80. And the command you write after the image name — for example `echo hello` — replaces the image's default command. Each container needs a name (`--name`) so you can find it again afterwards.

## Command Reference

### `docker run --name <name> -e KEY=value <image> <command>`

Creates and starts a container: names it, passes environment variables, and overrides the image's default command with `<command>`.

### `docker run -d --name <name> -p HOST:CONTAINER <image>`

Starts a container in the background (`-d`) and publishes a container port on the host.

### `docker ps -a` / `docker inspect <name>` / `docker logs <name>`

List containers, read a container's configuration, and view its output — your verification tools.

### `docker port <container>`

Lists the port mappings of a running container.

## Scenario

Create three containers, each exercising one way to configure a container at runtime: an environment variable, a published port, and a command override. Verify each one using the inspection commands from Lab 2.

## Objective

Run `docker run --name greet -e GREETING=hello alpine printenv GREETING` and confirm the output is `hello`. Then run `docker run -d --name web -p 9090:80 nginx:alpine` and use `docker port web` to confirm host port 9090 maps to container port 80. Finally run `docker run --name cmd-demo alpine echo lab-3 complete` and confirm its logs contain `lab-3 complete`.

## Tasks

- [ ] **set-env** — Create a container named `greet` that prints the value of `GREETING=hello` and then exits; confirm with `docker logs greet`.
- [ ] **map-port** — Start a background nginx container named `web` that is reachable on host port 9090; confirm with `docker port web`.
- [ ] **override-cmd** — Create a container named `cmd-demo` that runs `echo lab-3 complete` and then exits; confirm with `docker logs cmd-demo`.

## Reflection

The image stays the same — the configuration changes at runtime. Environment variables inject settings without rebuilding, port mapping is what makes a container reachable from outside, and a command override lets the same image do different things. In each case `docker inspect`, `docker logs`, and `docker port` let you verify that what you intended is actually what the container received.
