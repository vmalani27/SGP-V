# Chapter 3: Configuring Containers

## In this chapter, you will

- Pass configuration to containers using environment variables
- Override default settings without rebuilding images
- Understand how containers store temporary data

## Why Configuration Matters

The same nginx image can serve a personal blog, a company homepage, or an API gateway. The difference is configuration. Containers get their configuration through environment variables — key-value pairs that the application reads when it starts.

Think of environment variables as settings knobs. The image provides the defaults, but you can turn the knobs when you run the container.

## Passing Environment Variables

Use the `-e` flag to set environment variables:

```
docker run -d -e POSTGRES_PASSWORD=secret123 -p 5432:5432 postgres
```

This starts a PostgreSQL database with the password `secret123`. Without the `-e` flag, PostgreSQL would not start — it requires a password to be set.

You can pass multiple variables:

```
docker run -d \
  -e POSTGRES_PASSWORD=secret123 \
  -e POSTGRES_DB=myapp \
  -e POSTGRES_USER=admin \
  -p 5432:5432 postgres
```

Each `-e` flag sets one variable. The application inside the container reads these variables and configures itself accordingly.

## What Happens Inside the Container

When you set an environment variable, Docker makes it available to every process inside the container. The application can read it with standard system calls:

```
# Inside the container:
echo $POSTGRES_PASSWORD
# Output: secret123
```

The application is designed to check for these variables at startup. If the variable is not set, it uses a built-in default (or fails if the variable is required).

## Inspecting a Running Container

To see the full configuration of a running container:

```
docker inspect <container-id>
```

This shows everything: network settings, environment variables, mount points, resource limits. It outputs JSON, so pipe it through `grep` to find specific values:

```
docker inspect <container-id> | grep -A 5 "Env"
```

## Viewing Container Logs

To see what a container is doing:

```
docker logs <container-id>
```

To follow logs in real time (like `tail -f`):

```
docker logs -f <container-id>
```

Press `Ctrl+C` to stop following. The container keeps running.

> **Tip:** If a container exits immediately after starting, the first thing to check is `docker logs`. The application will usually print an error message explaining why it failed — often a missing required environment variable.

## Containers Are Ephemeral

When a container stops, everything it wrote to its writable layer is gone. Files created, databases written, logs generated — all gone when you `docker rm` the container.

This is by design. Containers are meant to be disposable. You should not rely on data stored inside a container for anything permanent. (Chapter 9 covers how to persist data with volumes.)

> **Warning:** Do not store important data inside a container without using volumes. If you run `docker rm`, that data is gone forever. Containers are temporary by nature.

> **Try This:** Run a PostgreSQL container with `docker run -d -e POSTGRES_PASSWORD=test -p 5432:5432 postgres`. Connect to it, create a table, insert some data. Then stop and remove the container. Start a new one with the same command. Your data is gone — the new container started fresh. This demonstrates why volumes matter (which you will learn about later).

## Key Takeaways

- Pass configuration to containers with `-e KEY=VALUE` flags
- Environment variables are how containers receive settings without rebuilding images
- `docker logs` shows what a container is doing — your first debugging tool
- Containers are ephemeral: data inside the writable layer is lost when the container is removed
