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

> **Tip:** If a container exits immediately after starting, check its logs with `docker logs` (from Chapter 2) — the application usually prints why it failed, often a missing environment variable or a bad command.

> **Try This:** Run `docker run -d --name site -p 9090:80 -e SITE_MODE=production nginx:alpine`. Inspect it with `docker inspect site` and find `SITE_MODE=production` in the `Env` section and `9090` in the port mappings. Read its startup logs with `docker logs site`. Then stop and remove it with `docker stop site && docker rm site`.

## Key Takeaways

- Pass configuration at runtime with `-e KEY=VALUE`, without rebuilding the image
- The command after the image name overrides the image's default command
- `-p HOST:CONTAINER` publishes a container port to the host
- `docker port <name>` lists a container's port mappings
- If a container fails to start, its logs explain why
