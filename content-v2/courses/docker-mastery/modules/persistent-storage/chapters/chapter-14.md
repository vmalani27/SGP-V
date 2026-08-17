# Chapter 14: Why Data Dies When Containers Stop

## In this chapter, you will

- Understand why containers lose data
- Use volumes to persist data across container restarts
- Know when to use volumes vs. bind mounts

## The Core Problem

Remember Chapter 4? You ran an Alpine container, created a file inside it, removed the container, and started a fresh one from the same image — the file was gone.

This is not a bug. It is by design. Containers are ephemeral. The writable layer on top of the image is temporary. When the container is removed, that layer goes with it.

But databases need to store data. File uploads need to survive. Logs need to be preserved. You need a way to keep data alive after the container is gone.

## Volumes: Persistent Storage

A **volume** is a storage area managed by Docker that exists independently of any container. You mount a volume into a container, and everything written to that mount point persists.

```
docker run -d \
  -e POSTGRES_PASSWORD=secret \
  -v pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres
```

The `-v pgdata:/var/lib/postgresql/data` flag creates a named volume called `pgdata` and mounts it at `/var/lib/postgresql/data` inside the container. PostgreSQL writes its data files there.

Now if you remove the container:

```
docker rm -f <container-id>
```

The volume still exists. Start a new container with the same volume:

```
docker run -d \
  -e POSTGRES_PASSWORD=secret \
  -v pgdata:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres
```

Your data is back. The new container reads from the same volume.

## Managing Volumes

| Command | Purpose |
|---------|---------|
| `docker volume ls` | List all volumes |
| `docker volume inspect pgdata` | See details (mount point, driver, labels) |
| `docker volume rm pgdata` | Delete a volume |
| `docker volume prune` | Remove all unused volumes |

## Bind Mounts: Linking to Your Filesystem

A **bind mount** maps a specific directory on your host machine into the container. Instead of Docker managing the storage, you are pointing at a real path on your disk.

```
docker run -d \
  -v /home/you/my-app:/app \
  -p 3000:3000 \
  node:20-alpine \
  node /app/server.js
```

The `-v /home/you/my-app:/app` flag maps your local project directory into the container at `/app`. Any changes you make to files on your machine are immediately visible inside the container, and vice versa.

This is extremely useful for development. Edit code on your machine, see the changes running inside the container — no rebuild required.

## Volumes vs. Bind Mounts

| | Volumes | Bind Mounts |
|---|---------|------------|
| **Managed by Docker** | Yes | No |
| **Storage location** | Docker's storage directory | Your filesystem |
| **Use case** | Production data (databases, uploads) | Development (live code reload) |
| **Performance** | Good on Linux, okay on Mac/Windows | Depends on the host filesystem |
| **Backup** | `docker volume` commands | Copy the directory directly |

**Rule of thumb:** Use volumes for data that needs to survive container restarts in production. Use bind mounts for development where you want live file access.

> **Tip:** In Docker Compose, volumes are defined at the bottom of the file and referenced in each service. This keeps your volume configuration centralized and easy to manage.

> **Warning:** Bind mounts give the container access to your host filesystem. Be careful about what you mount. Mounting `/` or your home directory into a container is a security risk — the container can read and write any file you have access to.

> **Try This:** Start a PostgreSQL container with a named volume. Create a table and insert data. Remove the container. Start a new container with the same volume name. Connect and verify your data survived. Then try the same thing but without a volume — your data will be gone.

## Key Takeaways

- Container data is ephemeral — it is lost when the container is removed
- **Volumes** are Docker-managed storage that persists independently of containers
- **Bind mounts** map a host directory into the container — useful for development
- Use volumes for production data, bind mounts for development workflows
