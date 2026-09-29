# Lab 2: Diagnosing a Container Failure

## Scenario

You have just been handed access to a server. Two containers should be running: `api-service` (a background API) and `payment-api` (a payment processor). When you run `docker ps`, only one appears. The payment service is down.

You do not know what happened. You were not there when it crashed. Your job is to use the diagnostic tools from Chapter 2 to figure out what went wrong — without guessing.

This is the exact situation you will face on-call. The tools are `docker ps -a`, `docker logs`, and `docker inspect`. The evidence is in the container.

---

## Your Goal

Work through the diagnostic sequence:

1. Find the crashed container using the right `docker ps` flag
2. Read what it printed before it died
3. Extract its exit code
4. Identify the root cause from the evidence
5. Pull a specific environment variable from the running container using `docker inspect --format`

---

## Quick Reference

### Find all containers (including stopped)
```bash
docker ps -a
```

### Read a container's output
```bash
docker logs <name>
```

### Extract a specific field
```bash
docker inspect <name> --format '{{.State.ExitCode}}'
docker inspect <name> --format '{{json .Config.Env}}'
```

### Save output to a file
```bash
docker logs payment-api | tail -1 > ~/crash-reason.txt
docker inspect payment-api --format '{{.State.ExitCode}}' > ~/exit-code.txt
```

---

## What You Are Not Told

You are not told what command the container ran, why it failed, or what the exit code means. Read the logs, read the exit code, and reason from the evidence. That is what this lab is testing.
