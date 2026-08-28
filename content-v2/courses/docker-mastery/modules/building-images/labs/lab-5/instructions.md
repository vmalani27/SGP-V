# Lab 5: Build a Minimal Image

## What You're Doing and Why

So far you have run containers from images other people built. Now you will build an image of your own. The point of this lab is not the image itself — it is to make the pipeline visible: a **Dockerfile** describes the image, `docker build` turns that description into an **image**, and `docker run` turns the image into a **container**. By building something tiny, you see the whole pipeline without getting distracted by application details.

## Background

A Dockerfile is a text file of instructions. `FROM` picks the base image, `WORKDIR` sets the working directory, `COPY` brings files from the build context into the image, and `CMD` decides what runs when a container starts. The build command `docker build -t name <context>` reads the Dockerfile from that directory and produces an image tagged with `name`.

## Command Reference

### `docker build -t <name> <context-dir>`

Builds an image from the Dockerfile in the given directory and tags it. The directory argument is the build context.

### `docker run --name <name> <image>`

Runs a container from the image under a name. It stays around after it exits so you can inspect it (no `--rm`).

### `docker image inspect <image>`

Shows configuration of an image; also a quick way to confirm the image exists.

### `docker images`

Lists the images present on this system.

## Scenario

You create a tiny project with one file, describe how it becomes an image in a Dockerfile, build the image, and run it to see your file printed from inside the container.

## Objective

1. Create `~/my-image/hello.txt` containing `hello from my image`.
2. Write `~/my-image/Dockerfile` using `FROM alpine:latest`, `WORKDIR /app`, `COPY hello.txt .`, and a `CMD` (or `ENTRYPOINT`) that prints the file — e.g. `CMD ["cat", "hello.txt"]`. The image must print the file's contents when it runs.
3. Build the image as `my-first-image`.
4. Run it as a container named `hello` and confirm it prints `hello from my image`.
5. State which command produces the image and which produces the container.

## Tasks

- [ ] **create-project** — Create `~/my-image/hello.txt` containing `hello from my image`.
- [ ] **write-dockerfile** — Write a `Dockerfile` with `FROM`, `WORKDIR`, `COPY`, and a `CMD`/`ENTRYPOINT` that prints the file.
- [ ] **build-image** — Build it as `my-first-image`.
- [ ] **run-image** — Run it as a container named `hello` and confirm it prints `hello from my image`.
- [ ] **what-built** — Identify what `docker build` and `docker run` each produce.

## Reflection

You just completed the entire image pipeline in four small steps. The Dockerfile is a plan; the image is the built result; the container is that result running. Everything you build for the rest of this module — and everything you will ever deploy with Docker — is this same pipeline, just with more instructions between `FROM` and `CMD`.