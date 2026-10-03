# Chapter 13: Multi-Service Orchestration with Docker Compose

## In this chapter, you will

- Declaratively define multi-container architectures in `compose.yaml`
- Automate private networking and service discovery across service tiers
- Implement container health checks and deterministic startup ordering (`condition: service_healthy`)
- Master the Docker Compose CLI command family (`up`, `down`, `ps`, `logs`, `config`, `exec`)
- Manage environment variables and configuration injection cleanly

## The Problem We Are Solving

Managing multi-container applications with standalone `docker run` commands quickly becomes untenable. Consider a modest production stack consisting of a reverse proxy, an application backend, a cache, and a database:

```bash
# The fragile, manual way:
docker network create internal-net
docker network create public-net
docker run -d --name db --network internal-net -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=secret postgres:16
docker run -d --name cache --network internal-net redis:alpine
docker run -d --name api --network internal-net -e DB_HOST=db -e REDIS_HOST=cache my-api
docker network connect public-net api
docker run -d --name proxy --network public-net -p 80:80 nginx:alpine
```

This manual workflow suffers from three fatal operational flaws:
1. **Human Error & Drift:** Forgetting a flag, swapping port mappings, or misnaming an environment variable breaks the application.
2. **The Startup Race Condition:** Launching `api` immediately after `db` fails because PostgreSQL takes several seconds to initialize database files and listen on port 5432. Standard `docker run` cannot coordinate startup based on application readiness.
3. **Lifecycle Overhead:** Stopping, updating, or tearing down the stack requires executing dozens of interdependent commands in reverse order.

**Docker Compose** solves this by defining the entire desired state in a single declarative fileâ€”typically named `compose.yaml` (or `docker-compose.yml`).

## Concept & Architecture

Docker Compose reads your declarative specification, automatically provisions networks and volumes, resolves dependencies, and boots services in the correct sequence:

```text
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ compose.yaml                                                â”‚
â”‚                                                             â”‚
â”‚  services:                                                  â”‚
â”‚    proxy  â”€â”€(public-net)â”€â”€â–º  api  â”€â”€(internal-net)â”€â”€â–º cache â”‚
â”‚                                                             â”‚
â”‚  networks:                                                  â”‚
â”‚    public-net:                                              â”‚
â”‚    internal-net:                                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Deterministic Startup with Health Checks

By default, the legacy `depends_on` directive only waits until the dependency container is *created*, not until the service inside is actually ready to receive traffic.

The modern Compose specification allows you to pair `depends_on` with **health checks**:

```yaml
services:
  cache:
    image: redis:alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    image: my-api:latest
    depends_on:
      cache:
        condition: service_healthy
```

With `condition: service_healthy`, Compose polls the Redis container until `redis-cli ping` responds with `PONG`. Only then does Compose boot the `api` container.

---

## Docker Compose Command Reference & CLI Anatomy

Docker Compose provides a dedicated command suite accessed via `docker compose <SUBCOMMAND>` (modern v2 plugin).

### 1. Stack Lifecycle & Deployment

#### `docker compose up`
Creates networks, volumes, and containers, starting the entire declared application stack:
```bash
docker compose up [OPTIONS] [SERVICE...]
```
Key flags:
- `-d` / `--detach`: Runs containers in the background, freeing the terminal.
- `--build`: Forces Compose to rebuild any images defined with a `build:` directive before starting.
- `--remove-orphans`: Removes containers for services that were removed from the Compose file.
- `--wait`: Waits for all services to become running and healthy before returning control.

#### `docker compose down`
Stops running containers and destroys the networks created by `up`:
```bash
docker compose down [OPTIONS]
```
Key flags:
- `-v` / `--volumes`: Removes named volumes declared in the `volumes:` section. (Use with caution: deletes persistent database data!).
- `--rmi all|local`: Removes images used by the services.

#### `docker compose restart`, `stop`, & `start`
Manages running container processes without destroying networks or configuration:
```bash
docker compose stop [SERVICE]       # Stops running containers without removing them
docker compose start [SERVICE]      # Starts previously stopped containers
docker compose restart [SERVICE]    # Restarts service containers
```

---

### 2. Stack Observability & Debugging

#### `docker compose ps`
Lists the runtime status, healthcheck state, and published port mappings for all services in the current project:
```bash
docker compose ps [OPTIONS]
```
Flags:
- `-a` / `--all`: Includes stopped containers.
- `--format json`: Outputs structured JSON for automated tooling and scripts.

#### `docker compose logs`
Aggregates and interleaves logs from all containers in the stack with distinct colored prefixes:
```bash
docker compose logs [OPTIONS] [SERVICE]
```
Flags:
- `-f` / `--follow`: Follows log output in real time (equivalent to `tail -f`).
- `--tail <N>`: Displays only the last $N$ lines per service.

#### `docker compose config`
Parses, validates, and renders the resolved Compose specification:
```bash
docker compose config [OPTIONS]
```
Use this command to verify YAML syntax and inspect how environment variables (`.env`) interpolate into your final configuration. Passing `--quiet` exits with status 0 on valid syntax or 1 on error.

#### `docker compose exec`
Executes an arbitrary command inside a running service container:
```bash
docker compose exec [OPTIONS] <SERVICE> <COMMAND>
```
Example: `docker compose exec cache redis-cli ping` sends a ping directly to the `cache` service.

---

## Hands-On Execution & Terminal Steps

Let's inspect, validate, and orchestrate a multi-tier application stack using Docker Compose.

Try it â€” click **Run this next**, review each command, and press Enter:

## The Learning Loop (Cause & Effect)

:::
Now explore Compose's automatic network management and teardown semantics in the terminal: inspect the generated networks, test service-name DNS, tear down the stack, and confirm cleanup.

## Common Pitfalls & Anti-Patterns

### 1. Using `depends_on` Without Health Checks
Using bare `depends_on` only verifies that the dependency container process started. Databases like Postgres or MySQL often take 5â€“15 seconds to create lock files and listen on sockets. Always specify a `healthcheck` and use `condition: service_healthy` to eliminate startup crashes.

### 2. Hardcoding Secrets in `compose.yaml`
Committing database passwords or API keys directly into `compose.yaml` leads to credential leakage in version control. Instead, define variable placeholders in `compose.yaml` (e.g. `POSTGRES_PASSWORD: ${DB_PASS}`) and store local secrets in a `.env` file that is excluded in `.gitignore`.

### 3. Mixing Up Host Port and Container Port
In the `ports` block, the format is always `"HOST:CONTAINER"`. Writing `80:8080` routes external port 80 traffic to port 8080 inside the container. Writing `8080:80` routes external port 8080 traffic to port 80 inside the container. Always double-check ingress requirements.

### 4. Forgetting to Recreate Containers on Config Changes
Editing environment variables or port bindings in `compose.yaml` does not automatically update already-running containers. Running `docker compose up -d` compares the running state against the file and recreates *only* the modified containers without interrupting untouched services.

## Key Takeaways

- Docker Compose defines multi-container applications declaratively in `compose.yaml`.
- The CLI command suite (`up`, `down`, `ps`, `logs`, `config`, `exec`) manages the complete application lifecycle.
- Containers communicate seamlessly using their service names as DNS hostnames.
- Prevent startup race conditions by pairing `depends_on` with `condition: service_healthy`.
- Clean up all project containers and networks with `docker compose down`.
