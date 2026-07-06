# Lab 1: Installing Docker and Running Your First Container

## What You're Doing and Why

The fastest way to understand what Docker does is to run something with it. Before writing a single line of a Dockerfile, you should see how Docker can run a complete web server with one command, with no installation of nginx on your machine, and no configuration files to write. This lab makes that point immediately.

## Background

When you run a container, Docker first checks whether the image exists locally. If it does not, Docker pulls it from Docker Hub, which is the default public registry. An image is a read-only filesystem snapshot. A container is a running instance of that image with an isolated writable layer on top. You can run multiple containers from the same image simultaneously and they will not interfere with each other.

## Command Reference

### `docker run <image>`

Creates and starts a container from the specified image.

### `docker run -d <image>`

Runs the container in detached mode, returning control to the terminal immediately.

### `docker run -p 8080:80 <image>`

Maps port 80 inside the container to port 8080 on the host.

### `docker ps`

Lists running containers.

### `docker ps -a`

Lists all containers, including stopped ones.

### `docker stop <name-or-id>`

Stops a running container gracefully.

### `docker rm <name-or-id>`

Removes a stopped container.

## Scenario

Run an nginx web server using Docker. Access it from your browser. Stop it and remove the container when you are done.

## Objective

Run nginx in detached mode with port 8080 mapped to port 80 inside the container. Visit `http://localhost:8080` and confirm you see the nginx welcome page. Stop and remove the container.

## Reflection

You ran a web server without installing nginx. When you removed the container, no trace of nginx remained on your machine. The image is still cached locally, but everything the running container created was discarded. This disposability is one of the most important properties of containers.
