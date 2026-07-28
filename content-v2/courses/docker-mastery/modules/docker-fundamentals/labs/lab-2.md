# Lab 2: Understanding Images and the Container Lifecycle

## What You're Doing and Why

Docker images are the building blocks of everything you run. Understanding how images are stored, how they relate to containers, and how to manage them efficiently prevents the most common beginner problem: a disk that fills up with hundreds of unused images and stopped containers. This lab teaches you to navigate the image and container lifecycle.

## Background

Images are made of layers. Each instruction in a Dockerfile creates a new layer. Layers are shared across images, which means if two images are based on the same Ubuntu base image, that base layer is only stored once on disk. Docker uses a union filesystem to present these layers as a single coherent filesystem when the container runs. When a container writes a file, the change goes into a new writable layer on top of the read-only image layers. When the container is removed, that writable layer is discarded.

## Command Reference

### `docker images`

Lists all images stored locally, with their size and creation date.

### `docker pull <image>:<tag>`

Downloads an image from the registry without running it.

### `docker image rm <image>`

Removes a local image. Fails if a container is using the image.

### `docker image prune`

Removes all dangling images — images with no tag and no container referencing them.

### `docker inspect <name-or-id>`

Shows detailed JSON metadata about a container or image, including its configuration, mounts, network, and state.

## Scenario

Pull three different images. Inspect one to understand its layer structure. Run a container, stop it without removing it, and observe that `docker ps -a` still shows it. Remove the container and then remove the image.

## Objective

Demonstrate the full lifecycle: pull, run, stop, inspect, remove container, remove image. Confirm that `docker ps -a` and `docker images` are both clean afterward.

## Reflection

Run `docker inspect` on a container and find the `Mounts` and `NetworkSettings` sections. Notice how much information Docker maintains about every container even after it has stopped. Everything you see there can be controlled through command-line flags when you create the container.
