# Chapter 12: Container Network Architecture & Modes

## In this chapter, you will

- Master the three core Docker network modes: `bridge`, `host`, and `none`
- Understand why `localhost` is isolated within each container namespace
- Publish container ports to the host using `-p host:container`
- Create user-defined bridge networks for automatic DNS service discovery
- Connect containers across multiple networks for tiered perimeter security

## The Problem We Are Solving

When developing on your local machine, applications typically communicate over `localhost` (e.g. your API connects to `localhost:5432` for PostgreSQL).

However, in Docker, **every container has its own private network namespace**. Inside a container, `localhost` refers exclusively to that specific containerâ€”not your host machine, and not any other container. If you run a web API and a database without configuring networking, neither can reach the other over `localhost`.

To connect containers, Docker virtualizes network stacks using distinct **network modes**.

---

## The Mental Model: Three Network Modes

When Docker runs a container, it attaches it to one of three primary network modes:

```text
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 1. BRIDGE (Default)                                                         â”‚
â”‚    Host (e.g. 192.168.1.50)                                                 â”‚
â”‚       â”‚                                                                     â”‚
â”‚       â”œâ”€â”€ [ Virtual Bridge Switch: 172.18.0.1 ]                             â”‚
â”‚       â”‚        â”œâ”€â”€ Container A (eth0: 172.18.0.2) â”€â”€â–º Port Mapping (-p)    â”‚
â”‚       â”‚        â””â”€â”€ Container B (eth0: 172.18.0.3)                           â”‚
â”‚    Isolated private subnet. External traffic enters via port forwarding.    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 2. HOST                                                                     â”‚
â”‚    Host (192.168.1.50) â—„â•â•â• Container shares host stack directly           â”‚
â”‚    No network isolation. Port 80 inside container = Port 80 on host.        â”‚
â”‚    Maximum performance, but risk of host port collisions.                   â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 3. NONE                                                                     â”‚
â”‚    Container (lo: 127.0.0.1 ONLY)                                           â”‚
â”‚    Completely air-gapped. Zero network interfaces, zero connectivity.       â”‚
â”‚    Ideal for isolated batch jobs, crypto key generation, and secure compute.â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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

Try it â€” click **Run this next**, review each command, and press Enter:

## The Learning Loop (Cause & Effect)

:::
Now observe the enforced boundary in the terminal: try resolving `cache-db` from outside `app-net`, inspect Docker's embedded DNS from inside the network, and clean up the demo resources.

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
