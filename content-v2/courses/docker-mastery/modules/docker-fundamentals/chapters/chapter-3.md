# Chapter 3: Configuring Containers

## In this chapter, you will

- Pass configuration to containers with environment variables
- Override the command a container runs at startup
- Publish container ports to the host with port mappings

## Why Configuration Matters

The same nginx image can serve a personal blog, a company homepage, or an API gateway. The difference is configuration. Containers receive their configuration as environment variables — key-value pairs the application reads when it starts.

Think of environment variables as settings knobs: the image provides the defaults, and you turn the knobs when you run the container, without rebuilding anything.

## Environment Variables

Use the `-e` flag to set an environment variable:

```
docker run -e GREETING=hello alpine printenv GREETING
```

`printenv GREETING` reads the variable and prints its value:

```
# Output:
hello
```

You can pass several variables — each `-e` sets one:

```
docker run \
  -e GREETING=hello \
  -e AUDIENCE=world \
  alpine sh -c 'echo "$GREETING, $AUDIENCE!"'
```

If a variable is not set, the application falls back to a default baked into the image — or fails to start, if the variable is required. Name the container with `--name` (from Chapter 2) so you can inspect it and read its logs afterwards.

Try it — the steps below load each command into the terminal for you. Click **Run this next**, review the command, then press Enter:

:::terminal-demo
id: configuring-containers
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: pass-env
    label: Pass an environment variable
    run: docker run --rm -e GREETING=hello alpine printenv GREETING
    expect: |
      `hello` is printed — the variable was injected when the container
      started, then the container exited and was removed (`--rm`).
  - id: pass-many-env
    label: Pass several environment variables
    run: docker run --rm -e GREETING=hello -e AUDIENCE=world alpine sh -c 'echo "$GREETING, $AUDIENCE!"'
    expect: |
      `hello, world!` — each `-e` flag sets one variable the application reads
      at startup.
:::

## Overriding the Command

The command you write after the image name replaces the image's default command:

```
docker run alpine echo lab-3 complete
```

The image's default command is what runs when you write no command: nginx's default starts the web server, alpine's default is an interactive shell. `echo lab-3 complete` runs instead, prints, and the container exits.

The command is part of the container's configuration, so you can read it back afterwards:

```
docker inspect <name> --format '{{.Config.Cmd}}'
```

See for yourself — the override runs instead of the image's default, and the command you set is part of the container's configuration:

:::terminal-demo
id: configuring-containers
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: override-cmd
    label: Override the image's default command
    run: docker run --rm alpine echo lab-3 complete
    expect: |
      `lab-3 complete` is printed. The command after the image name replaces
      the image's default command, then the container exits on its own.
  - id: create-cmd-demo
    label: Create a container to inspect
    run: docker run -d --name cmd-demo alpine sleep 300
    expect: |
      A container ID is printed — `cmd-demo` is running `sleep 300` in the
      background so it stays up long enough to inspect.
  - id: inspect-cmd
    label: Read the command back
    run: docker inspect cmd-demo --format '{{.Config.Cmd}}'
    expect: |
      `[sleep 300]` — the command you passed at `run` time is stored in the
      container's configuration.
  - id: remove-cmd-demo
    label: Remove it
    run: docker rm -f cmd-demo
    expect: |
      `cmd-demo` is echoed — the container is gone.
:::

## Publishing Ports

A container runs in its own network namespace. By default nothing inside it is reachable from outside — the network is sealed off. To expose a port, publish it when you run the container:

```
docker run -d --name web -p 9090:80 nginx:alpine
```

`-p HOST:CONTAINER` maps a host port to a container port: host port `9090` forwards to port `80` inside the container, where nginx listens by default. `-d` keeps the web server running in the background.

To confirm the mapping:

```
docker port web
# 80/tcp -> 0.0.0.0:9090
```

The `PORTS` column of `docker ps` shows the same information. Open `http://localhost:9090` and you will see the nginx welcome page. Use multiple `-p` flags to publish more than one port.

Try it — run nginx with a published port, then confirm the mapping and read back the configuration you passed:

:::terminal-demo
id: configuring-containers
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
  - nginx:alpine
state:
  label: web container
  command: docker inspect -f '{{.State.Status}}' web 2>/dev/null || echo "not created"
steps:
  - id: run-web
    label: Publish a port and run nginx
    run: docker run -d --name web -p 9090:80 -e SITE_MODE=production nginx:alpine
    expect: |
      A container ID is printed and the state chip flips to `running`. Host
      port `9090` now forwards to port `80` inside the container.
  - id: check-port
    label: Confirm the port mapping
    run: docker port web
    expect: |
      `80/tcp -> 0.0.0.0:9090` — the host port forwards to the container port.
      `docker ps` shows the same mapping in its `PORTS` column.
  - id: inspect-env
    label: Read the environment variable back
    run: docker inspect web | grep SITE_MODE
    expect: |
      A line reading `"SITE_MODE=production"` inside the `Env` array — the
      configuration you passed at `run` time is part of the container's config.
  - id: see-logs
    label: Read the web server logs
    run: docker logs web
    expect: |
      nginx startup lines, ending with something like `start worker processes`
      — the server is up and serving.
  - id: stop-web
    label: Stop and remove it
    run: docker stop web && docker rm web
    expect: |
      `web` is echoed twice and the state chip reads `not created` — the
      container is gone.
examples:
  - docker ps
  - docker run --rm -e SITE_MODE=production alpine printenv SITE_MODE
  - docker inspect web --format '{{json .HostConfig.PortBindings}}'
:::

> **Tip:** If a container exits immediately after starting, check its logs with `docker logs` (from Chapter 2) — the application usually prints why it failed, often a missing environment variable or a bad command.

> **Try This:** Run `docker run -d --name site -p 9090:80 -e SITE_MODE=production nginx:alpine`. Inspect it with `docker inspect site` and find `SITE_MODE=production` in the `Env` section and `9090` in the port mappings. Read its startup logs with `docker logs site`. Then stop and remove it with `docker stop site && docker rm site`.

## Key Takeaways

- Pass configuration at runtime with `-e KEY=VALUE`, without rebuilding the image
- The command after the image name overrides the image's default command
- `-p HOST:CONTAINER` publishes a container port to the host
- `docker port <name>` lists a container's port mappings
- If a container fails to start, its logs explain why
