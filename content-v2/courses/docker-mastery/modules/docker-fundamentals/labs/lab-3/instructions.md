# Lab 3: Runtime Configuration & Port Publishing Assessment

## Scenario

Production container workloads must be configured dynamically at runtime without rebuilding their underlying images. Configuration settings are passed via environment variables, ingress traffic is routed through published host ports, and startup behaviors are adjusted by overriding default command specifications.

Your objective is to deploy containers parameterized with environment variables, publish container web ports to the host network interface, override container process entry points, and evaluate the underlying Linux networking primitives enabling host-to-container routing.

This is an independent assessment. You are given operational constraints and acceptance criteria; you must determine the appropriate Docker CLI commands and parameter flags to achieve the target state.

---

## Operational Specifications & Contract

### 1. Environment Variable Injection
- Container Name: `runtime-config`
- Base Image: `alpine:latest`
- Environment Parameters:
  - `APP_ENV=production`
  - `SERVICE_PORT=8080`
- Execution: Must output the value of `APP_ENV` (`production`) to stdout upon startup and exit cleanly.

### 2. Ingress Port Publishing
- Container Name: `ingress-proxy`
- Base Image: `nginx:alpine`
- Lifecycle: Must run in detached mode (`-d`) and remain actively running.
- Port Binding: Publish host port `8080` to container port `80`.

### 3. Startup Command Override
- Container Name: `custom-worker`
- Base Image: `alpine:latest`
- Command Override: Replace the default shell/command to emit the exact string `SYSTEM_INITIALIZED` to stdout.
- Lifecycle: The container should terminate cleanly upon emitting output.

### 4. Port Forwarding Architecture
- Identify the Linux kernel and daemon networking mechanisms responsible for handling traffic forwarded via `-p host:container`.

---

## Acceptance Criteria

| Contract Requirement | Verification Check |
| :--- | :--- |
| **Environment Injection** | `runtime-config` carries `APP_ENV=production` and `SERVICE_PORT=8080`, and emitted `production`. |
| **Port Publishing** | `ingress-proxy` is running with host port 8080 bound to container port 80. |
| **Command Override** | `custom-worker` executed the overridden command and emitted `SYSTEM_INITIALIZED`. |
| **Forwarding Architecture** | Identify how iptables and docker-proxy handle published ports. |
