# Chapter 8: Composing Multi-Container Apps

## In this chapter, you will

- Define multi-container applications in a single file
- Use Docker Compose to start, stop, and manage services
- Understand how Compose networking and volumes work

## The Manual Way Is Untenable

Without Compose, running a full application stack looks like this:

```
docker network create app-net

docker run -d --name db --network app-net \
  -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres

docker run -d --name redis --network app-net -p 6379:6379 redis

docker run -d --name api --network app-net \
  -e DATABASE_URL=postgresql://postgres:secret@db:5432/myapp \
  -e REDIS_URL=redis://redis:6379 \
  -p 3000:3000 my-app
```

Three commands. Three containers to remember. If you restart your machine, you have to run all three again, in the right order, with the right flags. This does not scale.

## Docker Compose: One File, Everything

Docker Compose lets you define your entire application stack in a single `docker-compose.yml` file:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:secret@db:5432/myapp
      REDIS_URL: redis://redis:6379
    depends_on:
      - db
      - redis

volumes:
  pgdata:
```

With this file, a single command starts everything:

```
docker compose up -d
```

Docker Compose:

1. Creates a network for the application
2. Starts each service in the correct order
3. Connects them on the network with automatic DNS
4. Runs everything in the background (`-d`)

To stop everything:

```
docker compose down
```

To see what is running:

```
docker compose ps
```

## The `depends_on` Directive

The `depends_on` field tells Compose the startup order. `api` waits for `db` and `redis` to start before it launches. This is important because your application will fail if the database is not ready.

Note: `depends_on` waits for the container to *start*, not for the service inside it to be *ready*. Your application should still handle connection retries for production use.

## Compose Networking

When you run `docker compose up`, Compose automatically creates a network and connects all your services to it. Each service is reachable by its service name as a hostname.

In the example above, the `api` service connects to PostgreSQL using `db:5432` — the hostname `db` resolves to the `db` service's container. No manual network creation needed.

## Compose Volumes

The `volumes` section at the bottom defines named volumes that persist data between container restarts. In the example, `pgdata` stores PostgreSQL's data files. Even if the `db` container is removed and recreated, the data survives.

> **Tip:** Use `docker compose logs -f api` to follow logs for a specific service. This is your first debugging tool when something is not working.

> **Warning:** Do not commit your `docker-compose.yml` with hardcoded production secrets. Use environment variable files (`.env`) or Docker secrets for sensitive data. The `.env` file should be in `.gitignore`.

> **Try This:** Create a `docker-compose.yml` with a Redis service and a simple alpine container that pings Redis. Run `docker compose up`, watch it start both services, then run `docker compose down` to clean up. Notice how Compose handles the network and naming automatically.

## Key Takeaways

- Docker Compose defines multi-container applications in a single YAML file
- `docker compose up -d` starts everything; `docker compose down` stops and removes it
- Services communicate using their service names as hostnames
- `depends_on` controls startup order
- Named volumes persist data between container restarts
