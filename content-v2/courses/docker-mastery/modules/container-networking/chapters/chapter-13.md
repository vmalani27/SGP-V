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

**Docker Compose** solves this by defining the entire desired state in a single declarative file—typically named `compose.yaml` (or `docker-compose.yml`).

## Concept & Architecture

Docker Compose reads your declarative specification, automatically provisions networks and volumes, resolves dependencies, and boots services in the correct sequence:

```text
┌─────────────────────────────────────────────────────────────┐
│ compose.yaml                                                │
│                                                             │
│  services:                                                  │
│    proxy  ──(public-net)──►  api  ──(internal-net)──► cache │
│                                                             │
│  networks:                                                  │
│    public-net:                                              │
│    internal-net:                                            │
└─────────────────────────────────────────────────────────────┘
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

Try it — click **Run this next**, review each command, and press Enter:

:::terminal-demo
id: docker-compose-demo
image: labops-docker:latest
pre_pull:
  - alpine:latest
  - nginx:alpine
  - redis:alpine
state:
  label: web-gateway
  command: docker inspect -f '{{.State.Status}}' compose-stack-gateway-1 2>/dev/null || docker inspect -f '{{.State.Status}}' gateway 2>/dev/null || echo "not running"
steps:
  - id: prepare-compose-file
    label: Create the multi-tier Compose specification
    run: |
      mkdir -p ~/compose-stack && cd ~/compose-stack
      cat <<'EOF' > compose.yaml
      services:
        cache:
          image: redis:alpine
          networks:
            - private-tier
          healthcheck:
            test: ["CMD", "redis-cli", "ping"]
            interval: 2s
            timeout: 2s
            retries: 5

        gateway:
          image: nginx:alpine
          ports:
            - "8080:80"
          networks:
            - public-tier
            - private-tier
          depends_on:
            cache:
              condition: service_healthy

      networks:
        public-tier:
        private-tier:
      EOF
      ls -la && cat compose.yaml
    expect: |
      The `compose.yaml` specification defines two services (`cache` and `gateway`),
      isolated network tiers (`public-tier` and `private-tier`), and a healthcheck-gated
      dependency.
  - id: validate-config
    label: Validate the Compose specification syntax
    run: cd ~/compose-stack && docker compose config
    expect: |
      Docker Compose parses and canonicalizes the configuration, verifying syntax
      and validating network definitions.
  - id: launch-stack
    label: Launch the entire stack in detached mode
    run: cd ~/compose-stack && docker compose up -d
    expect: |
      Compose creates the networks, launches `cache`, waits for it to become healthy,
      and then starts `gateway`. The state chip switches to `running`.
  - id: check-services
    label: Inspect the running Compose services
    run: cd ~/compose-stack && docker compose ps
    expect: |
      Notice the STATUS column. `cache` displays `running (healthy)`, and `gateway`
      displays `running` with port mapping `0.0.0.0:8080->80/tcp`.
  - id: view-logs
    label: Inspect aggregated service logs
    run: cd ~/compose-stack && docker compose logs --tail 10
    expect: |
      Compose aggregates logs across all containers with distinct service prefixes
      (`cache-1` and `gateway-1`).
  - id: verify-ingress
    label: Verify public ingress to the Compose gateway
    run: curl -I http://localhost:8080
    expect: |
      HTTP/1.1 200 OK from Nginx. The composed architecture is serving live traffic.
examples:
  - docker compose -f ~/compose-stack/compose.yaml top
  - docker compose -f ~/compose-stack/compose.yaml images
:::

## The Learning Loop (Cause & Effect)

Now explore Compose's automatic network management and teardown semantics:

:::terminal-demo
id: docker-compose-demo
image: labops-docker:latest
pre_pull:
  - alpine:latest
  - nginx:alpine
  - redis:alpine
steps:
  - id: inspect-compose-networks
    label: Inspect networks auto-provisioned by Compose
    run: docker network ls | grep compose-stack
    expect: |
      Compose prefixed the network names with the project directory name:
      `compose-stack_public-tier` and `compose-stack_private-tier`.
  - id: test-dns-in-compose
    label: Test service discovery by Compose service name
    run: docker compose -f ~/compose-stack/compose.yaml exec gateway ping -c 2 cache
    expect: |
      Ping succeeds! Inside Compose networks, services resolve each other directly
      by their service key name (`cache`).
  - id: teardown-stack
    label: Gracefully stop and destroy the stack
    run: cd ~/compose-stack && docker compose down
    expect: |
      Compose stops containers in reverse dependency order, terminates processes,
      and removes the auto-created networks.
  - id: verify-cleanup
    label: Confirm all resources were pruned
    run: docker compose -f ~/compose-stack/compose.yaml ps && rm -rf ~/compose-stack
    expect: |
      Zero containers remain. The environment is completely clean.
:::

## Common Pitfalls & Anti-Patterns

### 1. Using `depends_on` Without Health Checks
Using bare `depends_on` only verifies that the dependency container process started. Databases like Postgres or MySQL often take 5–15 seconds to create lock files and listen on sockets. Always specify a `healthcheck` and use `condition: service_healthy` to eliminate startup crashes.

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
