# Chapter 3: Configuring Containers

:::terminal-demo
id: configuring-containers
image: labops-docker:latest
pre_pull:
  - alpine:latest
  - nginx:alpine
:::

---

> **Note — Prerequisites:** What you need to know before reading this chapter
>
> - **Container lifecycle (Chapter 2):** `docker ps`, `docker logs`, `docker inspect` — you'll use these to verify configuration worked
> - **IP addresses and ports — what they are:** the difference between `localhost` (127.0.0.1) and `0.0.0.0`, what a port number means, what "binding" to a port means — covered in Linux Fundamentals chapter 5
> - **Environment variables:** what they are and how applications use them to change their behaviour
> - **Basic networking:** what it means for a service to be "reachable" vs "only accessible from this machine"

---

## Your Teammate Can't Reach Your Container. Why?

You've been running a web service locally all morning. It works fine in your browser. You tell your teammate to hit `http://YOUR_IP:9090` so they can review the UI before you push it.

They try. It times out. You check your container:

```bash
docker ps
```

The container is running. `docker logs` shows the service started normally. But your teammate still can't reach it.

**This is the most common port mapping problem in Docker.** It has nothing to do with firewalls. The fix is one word in your `docker run` command. This chapter explains exactly what's happening and how to diagnose it.

A second scenario: same image deployed to staging and production behaves completely differently — the staging database gets wiped, the production one doesn't. Same image. Different behaviour. That's the second thing this chapter covers: environment variables as the correct mechanism for per-environment configuration.

---

## Environment Variables: Same Image, Different Behaviour

The 12-factor app methodology (the pattern most containerized apps follow) says: **store configuration in the environment, not in the image.** The image is fixed; the environment is what you control at runtime.

The same nginx image can act as a simple web server or a rate-limited API proxy. The same application image can point to a dev database or a prod database. The difference is the environment variables you inject when you `docker run`.

### Passing a single variable

```bash
docker run --rm -e DATABASE_URL=postgres://dev-db:5432/myapp alpine printenv DATABASE_URL
```

`-e KEY=VALUE` sets one variable. The application reads it at startup — it never looks at what the value was on your laptop; it only reads what you passed in.

### Passing multiple variables

```bash
docker run --rm \
  -e DATABASE_URL=postgres://dev-db:5432/myapp \
  -e LOG_LEVEL=debug \
  -e FEATURE_DARK_MODE=false \
  alpine sh -c 'printenv DATABASE_URL && printenv LOG_LEVEL'
```

Each `-e` sets one variable. You can have as many as you need.

### Loading variables from a file

In practice you don't want to type all your variables on the command line — especially not in shell history where they might be logged. Use a file:

```bash
# .env file
DATABASE_URL=postgres://dev-db:5432/myapp
LOG_LEVEL=debug
FEATURE_DARK_MODE=false
```

```bash
docker run --rm --env-file .env alpine printenv LOG_LEVEL
```

> **Warning:** Never commit `.env` files to git. They contain credentials. Add `.env` to your `.gitignore`. Use a `.env.sample` with placeholder values to show teammates what variables are needed without exposing real values.

### Verifying what got injected

To confirm the variables made it in:

```bash
docker run -d --name api-test -e LOG_LEVEL=debug alpine sleep 300
docker inspect api-test --format '{{json .Config.Env}}'
docker rm -f api-test
```

You'll see the injected variables in the output alongside any defaults baked into the image itself.

---

## Port Mapping: How Containers Reach the Outside World

A container runs inside its own **network namespace** — a completely isolated network stack with its own IP address (something like `172.17.0.3`). By default, nothing from outside can reach it. Not your browser, not your teammate's machine, not another container unless they're on the same Docker network.

To make a port reachable, you **publish** it when you run the container:

```bash
docker run -d --name web -p 9090:80 nginx:alpine
```

`-p HOST_PORT:CONTAINER_PORT` tells Docker to forward traffic arriving on the host's port `9090` to port `80` inside the container. This works through `iptables` DNAT rules Docker creates on the host automatically.

### Confirming the mapping

```bash
# Shows each published port
docker port web

# Shows the same info in the PORTS column
docker ps
```

### The 127.0.0.1 vs 0.0.0.0 problem

This is what was happening to your teammate. By default, Docker binds published ports to `0.0.0.0` — all network interfaces — which means the port is reachable from your LAN, not just from localhost. But some setups (older Docker versions, custom configurations, Docker Desktop on certain OS versions) may bind to `127.0.0.1` (loopback only).

When a port is bound to `127.0.0.1`, only processes on *that same machine* can reach it. Your teammate is on a different machine — the request never arrives.

You can control this explicitly:

```bash
# Bind to all interfaces — reachable from anywhere (default behaviour)
docker run -d --name web -p 0.0.0.0:9090:80 nginx:alpine

# Bind to loopback only — only reachable from this machine
docker run -d --name web-local -p 127.0.0.1:9090:80 nginx:alpine
```

`docker port web` shows you which address it bound to. If it shows `127.0.0.1:9090`, that's why remote access fails.

### EXPOSE vs -p: a common confusion

Dockerfiles often contain an `EXPOSE 80` line. Many people assume this publishes the port. **It does not.** `EXPOSE` is documentation — it tells humans (and tooling) what port the container listens on internally. It does nothing to networking unless you also use `-p` when you `docker run`.

```bash
# This does NOT make port 80 reachable from outside the container
docker run -d nginx:alpine

# This DOES make it reachable on host port 9090
docker run -d -p 9090:80 nginx:alpine
```

### Publishing all exposed ports automatically

```bash
# Docker picks random host ports for each EXPOSE'd port
docker run -d -P nginx:alpine
docker port <container>
```

Useful for testing, but in production you want predictable port numbers — use explicit `-p HOST:CONTAINER`.

---

## Overriding the Command

The command after the image name replaces whatever default command is baked into the image:

```bash
# Instead of starting nginx, just print the version and exit
docker run --rm nginx:alpine nginx -v

# Instead of the default alpine shell, run a specific script
docker run --rm alpine sh -c 'echo "Custom startup!"'
```

You can read back what command a container is configured to run:

```bash
docker run -d --name cmd-demo alpine sleep 300
docker inspect cmd-demo --format '{{.Config.Cmd}}'
docker rm -f cmd-demo
```

---

## When Configuration Goes Wrong

A container that fails to start usually has one of these causes:

| Symptom | Likely cause | Diagnosis |
|:--------|:-------------|:----------|
| Container exits immediately | Missing required env var, bad command | `docker logs <name>` |
| Port not reachable from other machine | Bound to 127.0.0.1 | `docker port <name>` |
| Port not reachable at all | `-p` flag missing | `docker ps` — check PORTS column |
| Port conflicts | Host port already in use | Error message at `docker run` time |
| Wrong behaviour vs last time | Env var pointing to wrong DB/service | `docker inspect <name> --format '{{json .Config.Env}}'` |

---

## Lab: Diagnose a Misconfigured Port Mapping

> **Lab:** Someone started a web service and it's unreachable. Find the exact misconfiguration.
>
> You're taking over for a teammate. They ran a container and told you it's serving on port 8080, but when you try to curl it from outside, nothing comes back. They're gone. You have to figure it out.
>
> **Setup — your teammate ran this:**
>
> ```bash
> docker run -d --name teammate-web -p 127.0.0.1:8080:80 nginx:alpine
> ```
>
> **Your tasks:**
>
> **Task 1:** Check that the container is actually running.
>
> ```bash
> docker ps
> ```
>
> It's running. Good. So why can't you reach it from another machine?
>
> **Task 2:** Check what address the port is actually bound to.
>
> ```bash
> docker port teammate-web
> ```
>
> You should see `80/tcp -> 127.0.0.1:8080`. That's the problem: it's bound to loopback only. You can reach it from *this* machine, but not from anywhere else.
>
> Verify that it's accessible from localhost:
>
> ```bash
> curl http://127.0.0.1:8080
> ```
>
> You get the nginx welcome page — so the service itself is fine, just unreachable from outside.
>
> **Task 3:** Fix it. Stop and remove the broken container, then re-run it correctly — bound to `0.0.0.0` so it's reachable from any interface.
>
> ```bash
> docker rm -f teammate-web
> docker run -d --name teammate-web -p 0.0.0.0:8080:80 nginx:alpine
> ```
>
> **Task 4:** Verify the fix.
>
> ```bash
> docker port teammate-web
> # Should now show: 80/tcp -> 0.0.0.0:8080
> curl http://localhost:8080
> ```
>
> **Bonus task:** Your teammate also forgot to pass the `SITE_ENV` variable the nginx config expects. Add `-e SITE_ENV=dev` to the run command and verify it shows up in `docker inspect teammate-web --format '{{json .Config.Env}}'`.
>
> **Cleanup:**
>
> ```bash
> docker rm -f teammate-web
> ```

---

## Connecting to docker-compose, Kubernetes, and Production

Everything you've done here with flags on `docker run` has a direct equivalent in every other tool you'll use:

**docker-compose.yml:**
```yaml
services:
  api:
    image: myapp:latest
    ports:
      - "0.0.0.0:8080:80"   # same as -p 0.0.0.0:8080:80
    environment:
      DATABASE_URL: postgres://db:5432/prod
      LOG_LEVEL: info
    env_file:
      - .env.prod             # same as --env-file
```

**Kubernetes (Deployment + Service):**
- `env:` in a container spec = the `-e` flags
- `envFrom: configMapRef:` = the `--env-file` flag
- A `Service` object handles port publishing — `ClusterIP`, `NodePort`, `LoadBalancer` are all variations of the `-p` concept, just at cluster scale

**CI/CD integration:**
- In GitHub Actions, secrets are passed as env vars to `docker run` steps — same mechanism, just the values come from GitHub's secret store instead of your `.env` file
- The separation between "image" and "config" is what makes the same container image promotable from dev → staging → prod without rebuilding — only the env vars change

**Team workflow:**
- `.env.sample` in your repo shows teammates what variables are needed
- Your CI pipeline has its own set of env vars (staging credentials) that it injects at test time
- Production has a different set (prod credentials) managed by whatever secrets system your team uses (AWS Secrets Manager, HashiCorp Vault, GitHub Secrets)

---

## Key Takeaways

- `-e KEY=VALUE` injects config at runtime; `--env-file .env` loads a whole file — same image, different behaviour per environment
- `-p HOST_PORT:CONTAINER_PORT` forwards traffic through iptables DNAT; without it, the container's port is unreachable from outside
- `0.0.0.0` = all interfaces (reachable from LAN); `127.0.0.1` = loopback only (this machine only)
- `docker port <name>` tells you exactly what address a port is bound to — check this first when access fails
- `EXPOSE` in a Dockerfile is documentation, not port publishing — `-p` is required to actually publish
- Use `docker inspect <name> --format '{{json .Config.Env}}'` to verify what variables were actually injected
