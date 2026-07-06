# Lab 6: Debugging Running Containers

## What You're Doing and Why

Containers hide the internals of an application behind an isolated boundary. When something goes wrong — and it will — you need tools to look inside. This lab teaches you to read logs, open a shell inside a running container, copy files out, and run ad hoc commands for diagnosis.

## Command Reference

### `docker logs <container>`

Prints the stdout and stderr output of a container.

### `docker logs -f <container>`

Follows the log output in real time.

### `docker exec -it <container> bash`

Opens an interactive bash shell inside a running container. Use `sh` if bash is not available.

### `docker exec <container> <command>`

Runs a command inside a running container without an interactive shell.

### `docker cp <container>:/path/to/file ./local`

Copies a file from inside the container to the host filesystem.

### `docker stats`

Shows live CPU, memory, network, and disk usage for all running containers.

### `docker top <container>`

Lists the processes running inside a container.

## Scenario

A container has been started that is behaving unexpectedly. Use logs and exec to diagnose the problem, identify what is wrong, and fix it without rebuilding the image.

## Objective

Read the container logs to identify an error. Open a shell inside the container and inspect the filesystem or configuration. Find the cause of the problem.

## Reflection

The ability to exec into a container and explore it like a regular Linux system is enormously useful during development. In production, containers are often built without a shell to reduce attack surface. Understanding what is and is not available in a minimal image helps you build better debugging tooling into your applications from the start.
