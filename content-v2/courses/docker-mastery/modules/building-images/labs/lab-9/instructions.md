# Lab 9: Building an Application Image

## What You're Doing and Why

Every lesson so far has built up to this: taking a real (if small) application and packaging it as an image. The image needs the application's source, its dependency manifest, a base image that provides the runtime, its dependencies installed, the port it listens on documented, and a startup command. You will build all of that and then prove the container actually serves requests. Keep the application tiny — a small app shows the full pattern without the noise of a production codebase.

## Background

A minimal Python HTTP server needs only the standard library. The Dockerfile follows the dependency-installation pattern: base runtime image, working directory, dependency manifest, `pip install`, application source, documented port, startup command. Because the manifest changes rarely and the source changes constantly, installing dependencies first keeps rebuilds fast — the exact behavior you observed in the layer-cache lab.

## Command Reference

### `docker build -t <name> <context-dir>`

Builds an image from the Dockerfile in the given directory.

### `docker run -d --name <name> -p 8000:8000 <image>`

Runs a container in the background and publishes its port 8000 to the lab environment.

### `curl -i http://localhost:8000/`

Fetches the app's URL and shows the HTTP status line and body.

## Scenario

You package a small Python HTTP server into an image, run it, and confirm it answers requests — the same shape as containerizing any real application.

## Objective

1. Create `~/hello-app` with `requirements.txt` and `app.py`.
2. Write a Dockerfile: `FROM python:3.12-alpine`, `WORKDIR /app`, `COPY requirements.txt .`, `RUN pip install -r requirements.txt`, `COPY app.py .`, `EXPOSE 8000`, `CMD ["python", "app.py"]`.
3. Build the image as `hello-app`.
4. Run it as `hello-app-c`, publishing port 8000.
5. Fetch `http://localhost:8000` and confirm HTTP 200 with `hello from the app`.
6. Explain the benefit of installing dependencies before copying the source.

## Tasks

- [ ] **create-app** — Create `~/hello-app` with `requirements.txt` and `app.py`.
- [ ] **write-dockerfile** — Write the application Dockerfile.
- [ ] **build-app** — Build the image as `hello-app`.
- [ ] **run-app** — Run it as `hello-app-c`, publishing port 8000.
- [ ] **verify-http** — Confirm the app returns HTTP 200 with `hello from the app`.
- [ ] **app-pattern** — Explain why dependencies are installed before the source is copied.

## Reflection

You containerized an application end to end: source, dependencies, runtime base image, installed packages, documented port, and startup command. The image you built is exactly what a real deployment would run. And the ordering question you answered is the same one every production Dockerfile answers — rarely-changing steps first, frequently-changing source last, so the expensive dependency install stays cached.