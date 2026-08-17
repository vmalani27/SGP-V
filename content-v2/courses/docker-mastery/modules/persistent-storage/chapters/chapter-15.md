# Chapter 15: Production Storage Patterns

## In this chapter, you will

- Choose the right volume strategy for different data types
- Back up and restore container data
- Handle secrets securely in containers

## What Needs to Persist

Not all data is the same. Here is how to think about what needs storage:

| Data Type | Strategy | Why |
|-----------|----------|-----|
| Database files | Named volume | Must survive container restarts, performance matters |
| User uploads | Named volume or external storage | Critical data, needs backups |
| Application logs | Bind mount or logging driver | Need to be accessible on the host |
| Configuration files | Bind mount or env vars | Changes frequently, should not be baked into images |
| Secrets | Environment variables or Docker secrets | Never in volumes, never in images |

## Backing Up Volumes

Docker volumes are just directories on your host machine. To back up a volume, you can run a temporary container that mounts the volume and copies its contents:

```
docker run --rm \
  -v pgdata:/source:ro \
  -v $(pwd):/backup \
  alpine \
  tar czf /backup/pgdata-backup.tar.gz -C /source .
```

This creates a compressed archive of the volume's contents in your current directory. The `:ro` flag mounts the volume as read-only — the backup container does not modify your data.

To restore from a backup:

```
docker run --rm \
  -v pgdata:/target \
  -v $(pwd):/backup \
  alpine \
  tar xzf /backup/pgdata-backup.tar.gz -C /target
```

> **Tip:** Automate volume backups with a cron job or a scheduled task. Database volumes should be backed up regularly, not just when you remember to do it.

## Handling Secrets

Secrets are sensitive values — database passwords, API keys, encryption keys. Never hardcode them in Dockerfiles, never commit them to version control, and never bake them into images.

### Environment Variables (Development)

```
docker run -e DATABASE_URL=postgresql://user:pass@db:5432/myapp my-app
```

Simple but not perfectly secure — environment variables are visible in `docker inspect` output and in `/proc/*/environ` inside the container.

### Docker Secrets (Swarm Mode)

Docker Swarm provides a built-in secrets mechanism:

```
echo "my-secret-password" | docker secret create db_password -
```

Secrets are stored encrypted and mounted as files into containers only when needed. They are never exposed as environment variables.

### `.env` Files with Compose (Development)

Create a `.env` file in your project root:

```
POSTGRES_PASSWORD=secret123
REDIS_PASSWORD=redis456
```

Reference the variables in your `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

Docker Compose reads `.env` automatically. Keep this file in `.gitignore`.

> **Warning:** `.env` files are not encrypted. They are plain text on your disk. Treat them like passwords — do not share them, do not commit them, and do not include them in Docker images.

## Production Checklist

Before deploying containers to production, verify:

1. **Volumes for persistent data** — databases, uploads, any data that must survive restarts
2. **Backup strategy** — automated, tested, and regularly verified
3. **Secrets management** — no hardcoded passwords, no secrets in images
4. **Resource limits** — set memory and CPU limits to prevent one container from starving others:

```
docker run -d --memory 512m --cpus 1.0 my-app
```

5. **Health checks** — tell Docker how to verify your application is healthy:

```
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/health || exit 1
```

> **Try This:** Create a Docker Compose file with a PostgreSQL service using a named volume. Add a `healthcheck` that verifies PostgreSQL is accepting connections. Add a second service that depends on the healthy database. Use `docker compose up` and watch the health status change from "starting" to "healthy".

## Key Takeaways

- Match your storage strategy to your data type — volumes for databases, bind mounts for development
- Back up volumes regularly using temporary containers that archive the data
- Use `.env` files for development secrets; Docker secrets for production
- Set resource limits and health checks on production containers
