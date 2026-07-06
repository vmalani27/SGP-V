# Lab 4: Volumes and Persistent Data

## What You're Doing and Why

Container filesystems are ephemeral. When a container is removed, everything written inside it is lost. This is a feature, not a bug — it is what makes containers stateless and reproducible. But databases, file uploads, and application state need to survive container restarts and replacements. Volumes solve this by storing data outside the container's lifecycle.

## Background

Docker provides two main mechanisms for persistent storage. A volume is managed by Docker and stored in a Docker-controlled location on the host filesystem. A bind mount maps a specific host directory into the container. Volumes are preferred for data that belongs to the container (database files, application state). Bind mounts are preferred for development workflows where you want to mount your source code into the container so changes are reflected immediately without rebuilding.

## Command Reference

### `docker volume create <name>`

Creates a named volume.

### `docker volume ls`

Lists all volumes.

### `docker run -v <volume-name>:/path/in/container <image>`

Mounts a named volume at the specified path inside the container.

### `docker run -v /host/path:/container/path <image>`

Mounts a host directory into the container as a bind mount.

### `docker volume inspect <name>`

Shows where the volume is stored on the host and other metadata.

## Scenario

Run a PostgreSQL container with a named volume storing the database files. Insert some data. Stop and remove the container. Start a new PostgreSQL container using the same volume and verify your data still exists.

## Objective

Demonstrate that data written in one container persists when that container is replaced, as long as both containers use the same named volume.

## Reflection

What happens to a named volume when you remove the container? Nothing — the volume outlives the container. You must explicitly run `docker volume rm` to delete it. This is intentional, because accidental data loss from removing a container would be far worse than accumulating unused volumes. Run `docker volume ls` to see all volumes on your machine and clean up any you no longer need.
