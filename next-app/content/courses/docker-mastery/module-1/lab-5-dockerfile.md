# Lab 5: Writing Your First Dockerfile

## What You're Doing and Why

Pulling existing images only gets you so far. To containerize your own application, you need to write a Dockerfile — a text file that describes how to build your image layer by layer. This is the most important skill in this module. Every application you ever deploy with Docker begins with a Dockerfile.

## Background

A Dockerfile is a sequence of instructions. Each instruction creates a new layer in the image. Docker caches each layer so that if nothing above a layer has changed, Docker reuses the cache and skips the step. This cache behavior is the reason Dockerfile instruction order matters: put the things that change rarely near the top and the things that change frequently near the bottom. Dependency installation changes rarely; application code changes constantly. Install dependencies first, then copy application code.

## Command Reference

### `FROM <image>`

Sets the base image. Every Dockerfile begins with `FROM`.

### `WORKDIR /path`

Sets the working directory for all subsequent instructions.

### `COPY <source> <destination>`

Copies files from the build context into the image.

### `RUN <command>`

Executes a command during the build and commits the result as a new layer.

### `CMD ["executable", "arg"]`

Sets the default command to run when the container starts. Can be overridden at runtime.

### `EXPOSE <port>`

Documents which port the application listens on. Does not actually publish the port.

### `docker build -t <name>:<tag> .`

Builds an image from the Dockerfile in the current directory and tags it with the given name.

## Scenario

A Python Flask application has been provided. It has a `requirements.txt` and a single `app.py`. Write a Dockerfile that installs the dependencies and runs the application. Build the image and run a container from it.

## Objective

Write a Dockerfile for the provided Flask application. Build the image. Run a container with the appropriate port mapping. Access the application from your browser.

## Reflection

Look at the order of your `COPY` and `RUN` instructions. If you copy `requirements.txt` and install dependencies before copying your application code, then Docker will reuse the cached dependency layer every time you rebuild, as long as `requirements.txt` has not changed. Modify `app.py` and rebuild. Observe that the dependency installation is skipped. Now move the `COPY requirements.txt` line below `COPY . .` and rebuild after changing `app.py`. Every rebuild now reinstalls all dependencies. Instruction order has a significant impact on build performance.
