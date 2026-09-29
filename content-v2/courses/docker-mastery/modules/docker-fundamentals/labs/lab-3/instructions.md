# Lab 3: Runtime Configuration & Port Mapping

## Scenario

A container named `broken-web` is already running in your environment. Your teammate says they can access the nginx welcome page from localhost, but when they try from their own machine it times out. The container is up. The service works. But something about the port binding is wrong.

Your job is to diagnose it, fix it, and then practice injecting environment variables — the mechanism that makes the same image behave differently in dev, staging, and prod.

---

## Your Goal

1. Run the command that reveals exactly which address the port is bound to
2. Identify why remote access fails (the binding is the clue)
3. Re-deploy the container correctly so it is reachable from any interface
4. Launch a second container with two environment variables injected and verify they made it in
5. Answer why `EXPOSE` in a Dockerfile is not the same as `-p`

---

## Quick Reference

### Check what address a port is bound to
```bash
docker port <name>
```

### Run with a port bound to all interfaces
```bash
docker run -d -p 0.0.0.0:9090:80 nginx:alpine
```

### Inject environment variables
```bash
docker run --rm -e APP_ENV=staging -e LOG_LEVEL=debug alpine printenv APP_ENV
```

### Verify injected variables
```bash
docker inspect <name> --format '{{json .Config.Env}}'
```

---

## The Key Distinction to Understand

`0.0.0.0` means "all network interfaces" — the port is reachable from the LAN, from the VM host, from any machine that can reach this server.

`127.0.0.1` means "loopback only" — the port only accepts connections from processes on this same machine.

When you run Docker on a remote server or a shared dev VM, `127.0.0.1` bindings are invisible to everyone else. That is the exact problem in this lab.
