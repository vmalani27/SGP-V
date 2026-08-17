# Chapter 12: How Containers Talk

## In this chapter, you will

- Understand Docker's default networking model
- Connect containers to each other using networks
- Expose container services to the outside world

## The Networking Problem

You have a Node.js API and a PostgreSQL database. You want the API to connect to the database. On your laptop, you would connect to `localhost:5432`. But inside a container, `localhost` refers to the container itself, not your machine or other containers.

Each container gets its own network namespace — its own `localhost`, its own ports, its own network stack. Containers cannot see each other unless you explicitly connect them.

## Docker's Default Networks

When you install Docker, it creates three networks:

| Network | Purpose |
|---------|---------|
| `bridge` | The default. Containers on the same bridge can talk to each other. |
| `host` | Container shares the host's network directly. No isolation. |
| `none` | No networking at all. Completely isolated. |

When you run `docker run -p 8080:80 nginx`, Docker connects the container to the `bridge` network and maps the port.

## Creating a Custom Network

The default bridge network works, but custom networks give you better isolation and automatic DNS resolution between containers.

```
docker network create my-network
```

Now run two containers on this network:

```
docker run -d --name db --network my-network \
  -e POSTGRES_PASSWORD=secret postgres

docker run -d --name api --network my-network \
  -p 3000:3000 my-app
```

The `api` container can now connect to the `db` container using the hostname `db`:

```
# Inside the api container:
psql -h db -U postgres
```

Docker's built-in DNS server resolves the container name `db` to the container's IP address on the network. This is why naming your containers matters.

## Port Mapping Explained

The `-p` flag maps a port on your host to a port inside the container:

```
-p 8080:80
```

This means: "when someone connects to port 8080 on my machine, forward that traffic to port 80 inside the container."

```
Your browser --> localhost:8080 --> Docker --> container:80
```

You can map multiple ports:

```
-p 3000:3000 -p 5432:5432
```

Or map to random host ports:

```
-p 3000
```

Docker picks an available port on your machine. Check which port with `docker port <container>`.

## Connecting to an Existing Network

To connect a running container to a network:

```
docker network connect my-network my-container
```

To disconnect:

```
docker network disconnect my-network my-container
```

> **Tip:** Use `docker network ls` to see all networks and `docker network inspect my-network` to see which containers are connected and their IP addresses.

> **Warning:** Do not rely on IP addresses for container-to-container communication. IP addresses change when containers restart. Use container names (which Docker's DNS resolves) instead. If your API connects to `172.18.0.2`, that address will be wrong after the database container restarts.

> **Try This:** Create a network, run a PostgreSQL container and a simple alpine container on it. From the alpine container, `exec` in and try to `ping db`. You should see successful responses. Then try connecting to the database with `psql -h db -U postgres -d postgres`.

## Key Takeaways

- Each container has its own isolated network namespace
- Custom networks provide DNS resolution — containers can reach each other by name
- `-p host:container` maps ports from your machine into the container
- Always use container names, not IP addresses, for service discovery
