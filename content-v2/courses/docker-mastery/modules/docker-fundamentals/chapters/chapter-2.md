# Chapter 2: Your First Container

## In this chapter, you will

- Run a container and trace what happens through the Docker stack
- Learn the image vs. container distinction through practice
- Manage the container lifecycle: start, list, stop, remove

## Running Your First Container

Type this command:

```
docker run hello-world
```

Here is what happens in order:

1. Docker checks if a `hello-world` image exists on your machine
2. It does not, so Docker pulls it from Docker Hub (the default public image registry)
3. Docker creates a container from that image
4. The container runs, prints a message, and exits

### What Happened Under the Hood

Recall the architecture from Chapter 1: your `docker` CLI sent an HTTP request to **dockerd** through the Unix socket. The daemon checked its image cache, found nothing, and told **containerd** to pull the `hello-world` image from Docker Hub. containerd downloaded the image layers and stored them on disk. Then the daemon sent a create-container request to containerd, which assembled an OCI bundle (a root filesystem from the image) and handed it to **runc**. runc created a fresh set of Linux namespaces (PID, Network, Mount, UTS, IPC), set up cgroups, and executed the container's entrypoint inside that isolated environment.

The entire process — downloading the image, creating the namespaces, configuring cgroups, running the container — took seconds. That speed is the direct result of sharing the host kernel rather than booting a full operating system.

## A More Useful Example

Let's run a real web server:

```
docker run -d -p 8080:80 nginx
```

Breaking this down:

| Flag | Meaning |
|------|---------|
| `-d` | Detached mode — run in the background, return control to your terminal |
| `-p 8080:80` | Map port 8080 on your machine to port 80 inside the container |

Now open `http://localhost:8080` in your browser. You will see the nginx welcome page. You just started a web server without installing nginx on your machine.

## Managing Containers

### See What Is Running

```
docker ps
```

This shows all currently running containers — their IDs, names, ports, and status.

### See Everything (Including Stopped)

```
docker ps -a
```

This includes containers that have exited. Every container you have ever run will appear here until you remove it.

### Stop a Running Container

```
docker stop <container-id-or-name>
```

Docker sends a SIGTERM signal, giving the application a chance to shut down gracefully. If it does not stop within 10 seconds, Docker sends SIGKILL.

### Remove a Container

```
docker rm <container-id-or-name>
```

You can only remove stopped containers. To stop and remove in one shot:

```
docker rm -f <container-id-or-name>
```

## The Lifecycle

```
docker run    -->  Running  -->  docker stop  -->  Stopped  -->  docker rm  -->  Gone
  (creates)                  (pauses)                         (deletes)
```

A container exists from the moment you run it until you remove it. Stopped containers still take up disk space. Clean them up regularly.

> **Warning:** Do not leave stopped containers piling up. Run `docker ps -a` periodically and remove containers you no longer need with `docker rm`. Stopped containers consume disk space for their writable layer.

> **Try This:** Run `docker run -d -p 8080:80 nginx`, then `docker ps` to see it. Visit `http://localhost:8080`. Then stop the container with `docker stop`, verify it stopped with `docker ps -a`, and remove it with `docker rm`. Run `docker ps -a` again to confirm it is gone.

## Key Takeaways

- `docker run` is a CLI command that triggers daemon → containerd → runc behind the scenes
- `-d` runs in the background; `-p` maps ports between host and container
- `docker ps` shows running containers; `docker ps -a` shows all
- Stop containers with `docker stop`, remove them with `docker rm`
- Clean up stopped containers to free disk space
- Every container runs in its own set of Linux namespaces, enforced by runc
