# Chapter 12: Container Network Architecture & Modes

## In this chapter, you will

- Master the three core Docker network modes: `bridge`, `host`, and `none`
- Understand why `localhost` is isolated within each container namespace
- Publish container ports to the host using `-p host:container`
- Create user-defined bridge networks for automatic DNS service discovery
- Connect containers across multiple networks for tiered perimeter security

## The Problem We Are Solving

When developing on your local machine, applications typically communicate over `localhost` (e.g. your API connects to `localhost:5432` for PostgreSQL).

However, in Docker, **every container has its own private network namespace**. Inside a container, `localhost` refers exclusively to that specific container—not your host machine, and not any other container. If you run a web API and a database without configuring networking, neither can reach the other over `localhost`.

To connect containers, Docker virtualizes network stacks using distinct **network modes**.

---

## The Mental Model: Three Network Modes

When Docker runs a container, it attaches it to one of three primary network modes:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. BRIDGE (Default)                                                         │
│    Host (e.g. 192.168.1.50)                                                 │
│       │                                                                     │
│       ├── [ Virtual Bridge Switch: 172.18.0.1 ]                             │
│       │        ├── Container A (eth0: 172.18.0.2) ──► Port Mapping (-p)    │
│       │        └── Container B (eth0: 172.18.0.3)                           │
│    Isolated private subnet. External traffic enters via port forwarding.    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. HOST                                                                     │
│    Host (192.168.1.50) ◄═══ Container shares host stack directly           │
│    No network isolation. Port 80 inside container = Port 80 on host.        │
│    Maximum performance, but risk of host port collisions.                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. NONE                                                                     │
│    Container (lo: 127.0.0.1 ONLY)                                           │
│    Completely air-gapped. Zero network interfaces, zero connectivity.       │
│    Ideal for isolated batch jobs, crypto key generation, and secure compute.│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. `bridge` Mode (Standard Isolation)
By default, Docker creates a virtual software switch (a bridge) on the host. Each container attached to the bridge receives its own private IP address on an internal subnet (e.g., `172.18.0.2`).
- To access a bridge container from your laptop, you **publish ports** (`-p 8080:80`).
- **Default Bridge vs. User-Defined Bridge**:
  - The default bridge (`docker0`) has **no automatic DNS resolution**; containers can only reach each other by brittle IP addresses.
  - User-defined bridges (`docker network create`) include Docker's **embedded DNS resolver (`127.0.0.11`)**, allowing containers to reach each other simply by using container names as hostnames (e.g. `ping cache-db`).

### 2. `host` Mode (Zero-Overhead Sharing)
In host mode, Docker removes the container's network isolation. The container shares the host machine's network stack directly:
- If an Nginx container in host mode listens on port 80, it binds directly to port 80 on your host machine.
- No `-p` port mapping is needed or allowed.
- **Trade-off**: You cannot run two containers in host mode that listen on the same port (port collision).

### 3. `none` Mode (Air-Gapped Sandbox)
In `none` mode, Docker creates a network namespace with only a loopback interface (`lo`). The container has **no external network access and no route to other containers**.
- Ideal for security-critical tasks like offline cryptographic signing, running untrusted code sandboxes, or batch processing confidential datasets.

---

## Essential Networking Commands

Docker provides a small, focused set of CLI commands to manage networks:

### 1. View Available Networks
```bash
docker network ls
```
Lists all networks on your system, showing their name and driver (`bridge`, `host`, `none`).

### 2. Run Containers with a Specific Network Mode
Use the `--network` flag on `docker run`:
```bash
docker run -d --network none my-offline-job       # Air-gapped container
docker run -d --network host my-web-app           # Shares host network directly
docker run -d --network my-net my-service         # Connects to custom bridge
```

### 3. Create a User-Defined Bridge Network
```bash
docker network create my-net
```
Provisions a new private bridge network with automatic DNS resolution.

### 4. Inspect Network Details & Connected Containers
```bash
docker network inspect my-net
```
Displays the subnet CIDR block, default gateway, and every container currently connected with its assigned IP address.

### 5. Connect or Disconnect a Running Container
```bash
docker network connect my-net my-running-container
docker network disconnect my-net my-running-container
```
Allows a running container to attach to multiple networks on the fly (dual-homing) without restarting.

### 6. Publish Ports to the Host (`-p`)
```bash
-p 8080:80              # Maps all host interfaces (0.0.0.0:8080) to container port 80
-p 127.0.0.1:8080:80    # Maps strictly to host localhost (safe for local reverse proxies)
```

---

## Hands-On Execution & Terminal Steps

Let's test all three network modes (`none`, `host`, and `bridge`) and experience user-defined DNS in action.

Try it — click **Run this next**, review each command, and press Enter:

:::terminal-demo
id: container-networking
image: labops-docker:latest
pre_pull:
  - alpine:latest
  - nginx:alpine
  - redis:alpine
state:
  label: web-proxy
  command: docker inspect -f '{{.State.Status}}' web-proxy 2>/dev/null || echo "not running"
steps:
  - id: list-networks
    label: Inspect default networks
    run: docker network ls
    expect: |
      Notice the three built-in networks corresponding to the three modes:
      `bridge`, `host`, and `none`.
  - id: test-none-mode
    label: Test the 'none' air-gapped network mode
    run: docker run --rm --network none alpine ip addr
    expect: |
      Notice there is ONLY the loopback interface (`lo`). There is no `eth0` interface
      and no default gateway. The container is completely air-gapped.
  - id: create-custom-network
    label: Create a user-defined bridge network
    run: docker network create app-net
    expect: |
      Docker provisions a new virtual bridge network with automatic DNS resolution enabled.
  - id: run-backend-cache
    label: Launch a private Redis container on app-net
    run: docker run -d --name cache-db --network app-net redis:alpine
    expect: |
      The container launches on `app-net`. Notice no `-p` flag was used:
      `cache-db` is accessible to peer containers on `app-net`, but completely hidden from the host.
  - id: test-dns-resolution
    label: Verify automatic DNS service discovery by container name
    run: docker run --rm --network app-net alpine ping -c 2 cache-db
    expect: |
      The ping succeeds! Docker's embedded DNS server resolved `cache-db` directly
      to its assigned container IP on `app-net`.
  - id: deploy-public-proxy
    label: Deploy a public proxy with port publishing
    run: docker run -d --name web-proxy --network app-net -p 8080:80 nginx:alpine
    expect: |
      `web-proxy` runs on `app-net` with host port 8080 mapped to container port 80.
      The state chip switches to `running`.
  - id: test-ingress-traffic
    label: Verify external traffic reaches web-proxy
    run: curl -I http://localhost:8080
    expect: |
      HTTP/1.1 200 OK from Nginx. Traffic from your host arrives on port 8080 and routes
      directly into the container.
examples:
  - docker network inspect app-net
  - docker port web-proxy
:::

## The Learning Loop (Cause & Effect)

Now observe what happens when network boundaries are enforced:

:::terminal-demo
id: container-networking
image: labops-docker:latest
pre_pull:
  - alpine:latest
  - nginx:alpine
  - redis:alpine
steps:
  - id: test-isolation-failure
    label: Attempt to ping cache-db from outside app-net
    run: docker run --rm alpine ping -c 2 cache-db 2>&1 || echo "RESOLVE_FAILED_ISOLATION_PROVEN"
    expect: |
      Fails with `bad address 'cache-db'`. Containers that are not members of `app-net`
      have zero visibility into its DNS or traffic.
  - id: inspect-embedded-dns
    label: Query Docker's embedded DNS resolver address
    run: docker run --rm --network app-net alpine nslookup cache-db
    expect: |
      Look at the `Server` address: `127.0.0.11`. Every user-defined bridge network
      automatically routes DNS lookups through Docker's internal resolver at `127.0.0.11`.
  - id: cleanup-network-demo
    label: Clean up containers and custom network
    run: docker rm -f cache-db web-proxy && docker network rm app-net
    expect: |
      All demo resources are cleanly removed.
:::

## Common Pitfalls & Anti-Patterns

### 1. Relying on the Default Bridge (`docker0`)
Deploying multi-container services on the default bridge requires hardcoding volatile IP addresses because the default bridge does not support automatic DNS. Always create a user-defined bridge with `docker network create`.

### 2. Publishing Internal Service Ports Unnecessarily
Binding database ports to the host (such as `-p 6379:6379`) when only internal API services need access exposes your database to the entire local network. Internal services should communicate over private Docker networks without publishing ports to the host.

### 3. Port Collisions in Host Mode
Running containers in `--network host` bypasses port isolation. If two containers both try to listen on port 80, the second one crashes with `bind: address already in use`. Use host mode only when raw throughput demands it and ports do not conflict.

### 4. Unintended Public Exposure (`0.0.0.0`)
When you write `-p 8080:80`, Docker binds to all network interfaces on your machine (`0.0.0.0:8080`), which often bypasses host firewalls. If a container should only be accessible locally on your machine, explicitly bind to localhost: `-p 127.0.0.1:8080:80`.

## Key Takeaways

- **`bridge` mode**: Standard private virtual network. Containers get private IPs, and external traffic enters via `-p host:container`.
- **`host` mode**: Shares the host's network stack directly for maximum performance, but sacrifices port isolation.
- **`none` mode**: Completely air-gapped network namespace with only a loopback interface, ideal for secure offline compute.
- **User-Defined Bridges**: Always create custom networks (`docker network create`) to get automatic DNS service discovery (`127.0.0.11`) by container name.
