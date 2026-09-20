# Base Images

This document records the base images currently declared by the project Dockerfiles.
Image references use tags rather than immutable digests, so rebuilding later may
resolve to newer image content under the same tag.

## Platform Services

| Service | Dockerfile | Base image and tag |
|---|---|---|
| Orchestrator | [`orchestrator/Dockerfile`](../../orchestrator/Dockerfile) | `python:3.12-alpine` |
| Next.js frontend | [`next-app/Dockerfile`](../../next-app/Dockerfile) | `node:20-alpine` |
| Content sync sidecar | [`sidecars/content-sync/Dockerfile`](../../sidecars/content-sync/Dockerfile) | `golang:1.23-alpine` and `alpine:3.20` |

## Lab Images

The lab image Dockerfiles are under [`orchestrator/lab-images`](../../orchestrator/lab-images).
The provisioning script builds these images locally only when the corresponding
published image cannot be pulled.

| Image Dockerfile | Base image and tag | Notes |
|---|---|---|
| `Dockerfile.ubuntu` | `ubuntu:22.04` | Base Ubuntu lab image. |
| `Dockerfile.docker` | `labops-ubuntu:latest` | Default `BASE_IMAGE`; adds Docker Engine. |
| `Dockerfile.docker-fundamentals` | `labops-ubuntu:latest` | Default `BASE_IMAGE`; adds Docker Engine and module fixtures. |
| `Dockerfile.docker-build` | `labops-docker:latest` | Default `BASE_IMAGE`; adds build-course fixtures and Node.js. |

`Dockerfile.docker`, `Dockerfile.docker-fundamentals`, and
`Dockerfile.docker-build` declare `ARG BASE_IMAGE`, so callers can override the
base during a local build:

```bash
docker build --build-arg BASE_IMAGE=<image>:<tag> ...
```

The default local build chain is:

```text
ubuntu:22.04
  -> labops-ubuntu:latest
  -> labops-docker:latest
  -> labops-docker-build:latest
```

`labops-docker-fundamentals:latest` branches directly from
`labops-ubuntu:latest`.

## Fixture Images

The Dockerfiles used by lab fixtures also use `node:20-alpine`:

- `orchestrator/lab-images/fixtures/express-app/Dockerfile`
- `orchestrator/lab-images/fixtures/order-service/Dockerfile`
- `orchestrator/lab-images/fixtures/order-service/Dockerfile.single`

## Updating This Document

When a `FROM` declaration changes, update this document in the same change.
Check both the Dockerfile and any build script that supplies `BASE_IMAGE` or
selects a published image before changing the documented value.
