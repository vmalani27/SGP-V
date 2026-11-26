# Lab 5: Build a Minimal Image

## What You're Doing and Why

So far you have executed containers using existing images. In this lab, you build a custom image from scratch to practice the complete container creation pipeline: authoring a Dockerfile, building a tagged image against a context directory, and executing the container.

## Background

A Dockerfile contains the declarative instructions for creating an image. The `FROM` instruction defines the parent base image, `WORKDIR` designates the working directory inside the container, `COPY` transfers files from the build context into the filesystem, and `CMD` specifies the default execution command. Running `docker build` processes these instructions into an image stored in the local Docker daemon cache.

## Command Reference

### `docker build -t <name:tag> <context-dir>`

Builds a tagged image from the Dockerfile located in the designated build context directory.

### `docker run --name <name> <image>`

Executes a container instance from an image under a specified container name.

### `docker image inspect <image>`

Displays detailed metadata and configuration for an image in the local image cache.

### `docker images`

Lists all images available in the local Docker engine store.

## Scenario

You need to package a system status announcement payload into a lightweight container image. You will set up the project files, author a Dockerfile that copies the payload into the container filesystem, build the tagged image, and launch a container to verify that it outputs the status message as expected.

## Objective

1. Create a project directory `~/status-banner` with `banner.txt` containing `System Status: All Services Operational`.
2. Author `~/status-banner/Dockerfile` to base on `alpine:latest`, configure `/app` as the working directory, copy `banner.txt`, and output the banner contents when started.
3. Build and tag the image as `status-banner:1.0`.
4. Run the image as a container named `status-runner` and verify the output.
5. Understand why Alpine Linux is chosen as a minimal base image.

## Tasks

- [ ] **create-project** — Create `~/status-banner/banner.txt` containing `System Status: All Services Operational`.
- [ ] **write-dockerfile** — Author a `Dockerfile` with `FROM`, `WORKDIR`, `COPY`, and `CMD` to display the banner.
- [ ] **build-image** — Build and tag the image as `status-banner:1.0`.
- [ ] **run-image** — Launch `status-runner` and confirm it prints the status banner in its logs.
- [ ] **alpine-base** — Identify why Alpine Linux is widely selected as a minimal base image.

## Reflection

You have completed the entire image lifecycle: authoring build instructions, assembling an immutable image artifact, and executing a container instance. Every complex multi-stage application image builds upon this exact foundational pipeline.