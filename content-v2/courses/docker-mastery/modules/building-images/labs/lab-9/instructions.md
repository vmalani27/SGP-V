# Lab 9: Building an Application Image

## What You're Doing and Why

Every lesson so far has built up to this: taking a real application and packaging it as an image. This lab is about the **containerization**, not the application. A starter application has already been provided to you in `~/hello-app` — your job is to write the Dockerfile, build the image, and prove the container actually serves requests.

By separating "the application" (given) from "the packaging" (your work), the lab stays focused: if your build or run fails, it is almost certainly a Dockerfile problem, not a Python problem.

## Background

The provided app is a minimal Python HTTP server using only the standard library. It listens on port `8000`, prints `ready` on startup, and answers every GET with HTTP 200 and the body `hello from the app`.

The Dockerfile follows the **dependency-installation pattern**: base runtime image, working directory, dependency manifest, `pip install`, application source, documented port, startup command. Because the manifest changes rarely and the source changes constantly, installing dependencies first keeps rebuilds fast — the exact behavior you observed in the layer-cache lab.

## Command Reference

### Run the provided app directly (to inspect it)

```bash
cd ~/hello-app && python app.py
```

It prints `ready` and stays running. In another terminal fetch `curl -i http://localhost:8000/`.

### `docker build -t <name> <context-dir>`

Builds an image from the Dockerfile in the given directory.

### `docker run -d --name <name> -p 8000:8000 <image>`

Runs a container in the background and publishes its port 8000 to the lab environment.

### `curl -i http://localhost:8000/`

Fetches the app's URL and shows the HTTP status line and body.

## Scenario

You are given a working application (`~/hello-app`) and asked to ship it as an image. The application is not the problem — the Dockerfile is. You write it, build, run, and confirm the container answers requests.

## Objective

1. Inspect the provided `~/hello-app/app.py` and `requirements.txt`. Run the app directly with Python and confirm it serves HTTP 200 with `hello from the app` on port 8000.
2. Write a `Dockerfile`: `FROM python:3.12-alpine`, `WORKDIR /app`, `COPY requirements.txt .`, `RUN pip install -r requirements.txt`, `COPY app.py .`, `EXPOSE 8000`, `CMD ["python", "app.py"]`.
3. Build the image as `hello-app`.
4. Run it as `hello-app-c`, publishing port 8000.
5. Fetch `http://localhost:8000` and confirm HTTP 200 with `hello from the app`.
6. Explain the benefit of installing dependencies before copying the source.

## Tasks

- [ ] **inspect-app** — Inspect the provided app and confirm it runs and serves on port 8000.
- [ ] **write-dockerfile** — Write the application Dockerfile.
- [ ] **build-app** — Build the image as `hello-app`.
- [ ] **run-app** — Run it as `hello-app-c`, publishing port 8000.
- [ ] **verify-http** — Confirm the app returns HTTP 200 with `hello from the app`.
- [ ] **app-pattern** — Explain why dependencies are installed before the source is copied.

## Reflection

You containerized an application end to end: a given source and dependency manifest, a base image that provides the runtime, installed dependencies, documented port, and startup command. Because the application was provided, you never had to wonder whether a failure was your code or your Dockerfile — every check in this lab isolates exactly what you were meant to practice. The ordering question you answered is the same one every production Dockerfile answers: rarely-changing steps first, frequently-changing source last, so the expensive dependency install stays cached.
