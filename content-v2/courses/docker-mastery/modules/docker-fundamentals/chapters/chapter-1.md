# Chapter 1: Why Containers Exist

## In this chapter, you will

- Understand the problem containers solve
- Learn how containers differ from virtual machines
- See why Docker became the standard

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

## Installing Docker

- **Windows/macOS**: Download Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/)
- **Linux**: Install the Docker Engine from [docs.docker.com/engine/install](https://docs.docker.com/engine/install/)

Verify the installation:

```
docker --version
```

> **Tip:** On Windows, make sure you have WSL 2 enabled. Docker Desktop works best with WSL 2 as its backend. The installer will guide you through this if needed.

> **Try This:** Run `docker --version` and `docker info`. The second command gives you a detailed overview of your Docker installation — how many containers are running, how much memory Docker has access to, and which storage driver it uses.

## Key Takeaways

- Containers package an application with its dependencies so it runs the same everywhere
- Containers are lighter than VMs — they share the host OS kernel instead of running a full OS
- An **image** is a read-only snapshot; a **container** is a running instance of an image
- Docker makes building and running containers simple and standardized
