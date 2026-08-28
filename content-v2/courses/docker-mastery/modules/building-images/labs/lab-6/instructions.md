# Lab 6: Dockerfile Fundamentals

## What You're Doing and Why

The last lab used three instructions (`FROM`, `COPY`, `CMD`). This lab adds the rest of the everyday set — `WORKDIR`, `RUN`, and `EXPOSE` — and, more importantly, makes you notice *when* each instruction runs. Some instructions run while the image is being built and their effects are frozen into the image; others describe what happens when a container starts. Getting that split right is the core of reading and writing Dockerfiles.

## Background

`FROM` picks the base image. `WORKDIR` sets the working directory for everything after it. `COPY` brings files from the build context into the image. `RUN` executes a command **during the build** and saves the result into a layer — this is how you install things and fix permissions before anyone ever runs the container. `EXPOSE` documents the application's intended port (it does not publish it). `CMD` sets the default command that runs **when a container starts**.

## Command Reference

### `docker build -t <name> <context-dir>`

Builds an image from the Dockerfile in the given directory.

### `docker run --name <name> <image>`

Runs a container from the image under a name. It stays around after it exits so you can inspect it (no `--rm`).

### `docker image inspect <image> --format '{{json .Config.ExposedPorts}}'`

Shows the ports documented by `EXPOSE` in the image's configuration.

## Scenario

You build a small "greeter" image that runs a shell script. The script must be executable inside the image, so you fix that with a `RUN` instruction during the build — and you document the application's port with `EXPOSE`.

## Objective

1. Create `~/greeter/greet.sh` — a `#!/bin/sh` script that prints `hello from the image`, marked executable.
2. Write a Dockerfile using all six common instructions: `FROM`, `WORKDIR`, `COPY`, `RUN`, `EXPOSE`, `CMD`.
3. Build the image as `greeter-app`.
4. Run it as a container named `greeter` and confirm it prints `hello from the image`.
5. Inspect the image and confirm port `8080` is documented.
6. State which instructions run at build time and which at run time.

## Tasks

- [ ] **create-script** — Create an executable `~/greeter/greet.sh` that prints `hello from the image`.
- [ ] **write-dockerfile** — Write a Dockerfile with `FROM`, `WORKDIR`, `COPY`, `RUN`, `EXPOSE`, and `CMD`.
- [ ] **build-image** — Build it as `greeter-app`.
- [ ] **run-image** — Run it as a container named `greeter` and confirm it prints `hello from the image`.
- [ ] **verify-expose** — Confirm the image documents port `8080`.
- [ ] **when-run** — Identify when `RUN` and `CMD` each execute.

## Reflection

`RUN` changed the image — it made the script executable before the container ever started. `CMD` does not run during the build; it only describes what happens at start. `EXPOSE` recorded port 8080 as metadata. Noticing which instructions are build-time and which are run-time will let you read any Dockerfile: the build-time ones are what the image *is*, and the run-time ones are what it *does*.