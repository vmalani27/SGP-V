# Chapter 1: Why Containers Exist

## In this chapter, you will

- Understand the problem containers solve
- Learn how containers differ from virtual machines
- See why Docker became the standard
- Understand Docker's architecture and how its components fit together

## The "Works on My Machine" Problem

You build an application on your laptop. It works perfectly. You send it to your teammate. It crashes. Their Node.js version is different. They are missing a system library. Their operating system handles file paths differently.

You spend two hours debugging environment differences instead of building features. This is one of the most common and frustrating problems in software development.

Containers solve this by packaging your application *together with everything it needs to run* — the right OS libraries, the right runtime version, the right environment variables. The package runs the same way everywhere.

## Virtual Machines vs. Containers

Before containers, the solution was virtual machines (VMs). A VM runs an entire operating system inside a window on your computer. It is like running a computer inside your computer.

| | Virtual Machines | Containers |
|---|---|---|
| **What they package** | Entire OS + application | Application + its dependencies |
| **Startup time** | Minutes | Seconds |
| **Size** | Gigabytes | Megabytes |
| **Isolation** | Hardware-level | Process-level |
| **Overhead** | Heavy (runs full OS) | Lightweight (shares host OS kernel) |

A VM is like renting an entire apartment — you get your own kitchen, bathroom, everything. A container is like renting a desk in a shared office — you get your own workspace, but you share the building's infrastructure.

Docker uses Linux kernel features (namespaces and cgroups) to create containers that are isolated from each other but share the host operating system's kernel. This is why containers are so much lighter than VMs.

### How Containers Achieve Isolation: Namespaces

Namespaces are a Linux kernel feature that gives each container its own isolated view of the system. When a process runs inside a container, it cannot see processes, network interfaces, or filesystems outside that container. The kernel enforces this at the system-call level.

| Namespace | What it isolates |
|-----------|-----------------|
| **PID** | Process IDs — a container sees only its own processes, starting from PID 1 |
| **Network** | Network interfaces, IP addresses, routing tables, port numbers |
| **Mount** | Filesystem mount points — each container has its own root filesystem |
| **UTS** | Hostname and domain name |
| **IPC** | Inter-process communication resources (shared memory, semaphores) |
| **User** | User and group IDs — a process can be root inside the container but an unprivileged user on the host |

When Docker starts a container, it creates a new set of namespaces for that container. The container's init process (PID 1) runs in its own PID namespace and sees no other processes on the host. It has its own network stack with its own loopback interface. Its filesystem is the image layers, mounted in an isolated mount namespace. From the container's perspective, it is the only thing running on the machine.

See for yourself — each command below spins up a fresh Alpine container whose isolation you observe from inside:

:::terminal-demo
id: why-containers
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: see-own-processes
    label: The container sees only its own processes
    run: docker run --rm alpine:latest ps aux
    expect: |
      Only a handful of processes, with `PID 1` being the container's own
      shell — the host's processes are invisible. That is the PID namespace.
  - id: see-own-hostname
    label: The container has its own hostname
    run: docker run --rm alpine:latest hostname
    expect: |
      A short random ID, not your machine's hostname — its own UTS namespace.
  - id: see-own-filesystem
    label: The container has its own filesystem
    run: docker run --rm alpine:latest ls /
    expect: |
      A minimal Alpine root filesystem — `bin`, `etc`, `lib` — not the host's
      directory tree. Each container mounts its image layers in an isolated
      mount namespace.
:::

### How Containers Stay Under Control: Cgroups

Cgroups (control groups) limit how much of a resource a container can use. Without cgroups, a single container could consume all available CPU or memory and starve other processes on the host.

- **CPU cgroups** restrict how many CPU cores or what percentage of CPU time a container may use
- **Memory cgroups** set hard and soft limits on the amount of RAM a container can allocate
- **Block I/O cgroups** limit read and write throughput to disk
- **PID cgroups** cap the number of processes a container may create
- **Device cgroups** control which devices (disk, GPU, etc.) a container can access

When you pass flags like `--memory=512m` or `--cpus=0.5` to `docker run`, Docker writes the corresponding cgroup configuration on the host. The kernel enforces these limits transparently — the container cannot exceed them even if it tries.

## What Docker Actually Does

Docker gives you two things:

1. **A way to build images** — read-only snapshots of your application and its environment
2. **A way to run containers** — running instances of those images

An **image** is the recipe. A **container** is the meal. You can run the same image to create multiple containers, just like you can follow the same recipe to cook multiple meals.

```
Image (recipe)         Container (meal)
+-----------+          +-----------+
| App code  |          | Running   |
| Runtime   |    -->   | app with  |
| Libraries |          | writable  |
| OS files  |          | layer     |
+-----------+          +-----------+
```

When you run a container, Docker adds a thin writable layer on top of the read-only image. Any changes the running application makes go into this layer. When you stop the container, this layer is discarded. The image stays unchanged.

Run the same image and watch it stay unchanged while a fresh container is created, runs, and exits on its own:

:::terminal-demo
id: why-containers
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: run-first
    label: Run the image as a container
    run: docker run --rm alpine:latest echo HELLO_FROM_ALPINE
    expect: |
      `HELLO_FROM_ALPINE` is printed and the container exits on its own — the
      `--rm` flag removes it as soon as it stops.
  - id: run-again
    label: Run the same image again
    run: docker run --rm alpine:latest echo SECOND_CONTAINER
    expect: |
      `SECOND_CONTAINER` is printed. The same image produced another,
      independent container.
  - id: confirm-image
    label: The image is still there
    run: docker images alpine
    expect: |
      A row for `alpine` with tag `latest` — running containers did not modify
      the image; it stays as the read-only recipe.
examples:
  - docker run --rm alpine:latest cat /etc/os-release
  - docker run --rm alpine:latest echo "same everywhere"
:::

## Docker Architecture

Docker is not a single program. It is a stack of components that each handle a specific part of running containers.

```
+--------------------------------------------+
|  docker (CLI)                              |
|  The command-line tool you type into        |
+--------------------+-----------------------+
                     |
                     | HTTP (REST API)
                     | /var/run/docker.sock
                     v
+--------------------------------------------+
|  dockerd (Docker Daemon)                   |
|  Receives API requests, manages images,    |
|  containers, networks, volumes             |
+--------------------+-----------------------+
                     |
                     | gRPC
                     v
+--------------------------------------------+
|  containerd                                  |
|  High-level container runtime — manages     |
|  image transfer, container lifecycle        |
+--------------------+-----------------------+
                     |
                     | runc (OCI runtime)
                     v
+--------------------------------------------+
|  runc                                        |
|  Low-level runtime — creates Linux          |
|  namespaces and cgroups, starts the        |
|  container process                          |
+--------------------------------------------+
```

### docker CLI

The `docker` command you run in your terminal is just a client. It translates your command (like `docker run nginx`) into HTTP requests and sends them to the Docker daemon through a Unix socket at `/var/run/docker.sock`. The CLI does not run containers — it only talks to the daemon.

### dockerd (Docker Daemon)

The daemon is the brain of Docker. It listens for API requests, manages images (pulling, storing, deleting), creates networks, allocates IP addresses, and orchestrates the full container lifecycle.

Because the daemon owns the socket file and needs access to kernel features, it runs as root. The CLI talks to the daemon through the socket — so if your user cannot access the socket, you get a permission error.

### containerd

containerd is the industry-standard container runtime, promoted from Docker into the Cloud Native Computing Foundation (CNCF). It handles everything between the daemon and the OS: pulling images from registries, storing them on disk, and managing the container lifecycle (create, start, stop, delete). Docker donated containerd to the community, and today it is used by Kubernetes and many other platforms as the runtime layer.

### runc

runc is the lowest-level component. It is a tiny, standalone tool that actually creates and runs containers. runc does the kernel work: it creates new namespaces for the container, configures cgroups for resource limits, and then executes the container process inside that isolated environment. Docker uses runc through containerd; you rarely interact with runc directly.

### The Unix Socket and Permissions

The Docker daemon listens on a Unix socket owned by `root:docker`. Any user in the `docker` group can communicate with the daemon without restrictions — effectively giving them root-level access because the daemon runs as root. This is why:

- **Fresh Linux install**: You must run `sudo docker ...` or add your user to the `docker` group with `sudo usermod -aG docker $USER`
- **Docker Desktop (macOS/Windows)**: A lightweight VM runs the daemon, and your macOS/Windows user communicates with it through a socket file — no sudo needed
- **Lab environments**: The platform may pre-configure the docker group, or you may need to handle permissions yourself

If you see `permission denied` when running a Docker command, it means your user is not in the `docker` group and cannot access the socket.

### What Happens When You Run a Container

When you type `docker run nginx`, this happens under the hood:

1. **CLI** → *HTTP POST to daemon* → "please create a container from the nginx image"
2. **Daemon** → *checks local image cache* → if missing, pulls the image layers from Docker Hub
3. **Daemon** → *tells containerd* → "here is the image, start a container"
4. **containerd** → *creates an OCI bundle* (a filesystem snapshot of the image) → *calls runc*
5. **runc** → *creates namespaces (PID, Network, Mount, UTS, IPC, User)* → *creates cgroups* → *executes `/docker-entrypoint.sh` inside the isolated environment*
6. The container is running. The daemon streams logs back to the CLI through the socket.

## Installing Docker

Installing Docker actually installs all the components described above — the CLI, the daemon, containerd, and runc.

### Linux

On Linux, installing the `docker.io` package or Docker's official repository gives you:

| Component | Package | What it provides |
|-----------|---------|-----------------|
| `docker` CLI | `docker-ce-cli` | The `docker` command you type |
| `dockerd` | `docker-ce` | The daemon service, started via systemd |
| `containerd` | `containerd.io` | The container runtime (bundled with Docker) |
| `runc` | `docker-ce` / `containerd.io` | The low-level OCI runtime |
| `docker-init` | `docker-ce` | A lightweight init system for containers (tini) |

After installation, the daemon is running as a systemd service (`systemctl status docker`), but your user likely cannot use it yet:

```
$ docker ps
permission denied while trying to connect to the Docker daemon socket
```

This is expected. The socket is owned by `root:docker`. Add your user to the `docker` group:

```
sudo usermod -aG docker $USER
```

Then log out and back in (or run `newgrp docker`). Verify with:

```
docker run hello-world
```

> **Why sudo is involved**: The `docker` group gives its members unrestricted access to the daemon socket, which runs as root. This is equivalent to root access on the host. Treat the `docker` group with the same care you would treat `sudo` access.

### macOS / Windows

Docker Desktop bundles all components into a single application that runs a lightweight Linux VM on your machine. The VM runs dockerd, containerd, and runc inside it. The Docker CLI on your host talks to the daemon inside the VM.

- **macOS**: Download Docker Desktop for Mac from docker.com. Requires Apple Silicon (M1+) or Intel chip. HyperKit (macOS's hypervisor) runs the Linux VM.
- **Windows**: Download Docker Desktop for Windows. Requires WSL 2 backend (recommended) or Hyper-V. WSL 2 provides a full Linux kernel that runs Docker natively.

On both platforms, no `sudo` or group management is needed — the installer handles permissions.

### Verify the Installation

```
docker --version
docker info
```

> **`docker info`** shows the full state of your daemon: how many containers exist, which storage driver is in use (overlay2 on modern Linux), which runtime is configured (runc), how many CPUs and how much memory Docker can use, and the daemon's operating system and architecture.

> **`docker version`** (without `--`) shows version info for both the CLI and the daemon. If the daemon line shows `Cannot connect`, your user cannot access the socket.

## Key Takeaways

- Containers package an application with its dependencies so it runs the same everywhere
- Containers are lighter than VMs — they share the host OS kernel instead of running a full OS
- **Namespaces** isolate each container's view of the system (processes, network, filesystem)
- **Cgroups** enforce resource limits so one container cannot starve the host
- Docker is a stack of components: **CLI → dockerd → containerd → runc**
- The Docker CLI is just a client that sends HTTP requests to the daemon through a Unix socket
- Installing Docker installs the CLI, daemon, containerd, and runc together
- On Linux, your user must be in the `docker` group to access the daemon socket without `sudo`
- An **image** is a read-only snapshot; a **container** is a running instance of an image
- Adding the `--memory` or `--cpus` flags on `docker run` controls resource limits through cgroups
