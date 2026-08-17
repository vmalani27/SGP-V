# Lab 8: Image Layers and Build Cache

## What You're Doing and Why

Docker builds images in **layers**, and it caches the layers it has already built. On your next build, any step whose inputs did not change is reused from cache instead of re-running. That behavior is why Dockerfile ordering matters — and it is easy to watch happen. In this lab you will build an image whose Dockerfile follows the dependency-installation pattern, then edit the source and the dependency file in turn and observe exactly which steps are cached and which re-run.

## Background

A Dockerfile is a sequence of steps, each producing a layer. Docker compares each step's inputs with the previous build; if they are unchanged, it reuses the cached layer and reports the step as **CACHED**. A step whose inputs changed re-runs, and everything *after* it re-runs too. The classic consequence: copy the dependency manifest, install dependencies, then copy the source. Dependencies change rarely, so their expensive install step stays cached across everyday source edits.

## Command Reference

### `docker build -t <name> <context-dir>`

Builds (or rebuilds) the image. The second build onward shows CACHED for unchanged steps.

### `docker run --rm <image>`

Runs the image and removes the container after it exits.

### `docker run --rm --entrypoint cat <image> /app/installed.txt`

Runs `cat` instead of the image's CMD, to read a file inside the image.

## Scenario

You build a stand-in for a real application: `deps.txt` plays the dependency manifest, a `RUN cp deps.txt installed.txt` plays "install dependencies", and `app.sh` plays the application source. You edit the source and the dependency file separately and watch the cache.

## Objective

1. Create `~/cache-demo` with `deps.txt` (`dep=v1`) and `app.sh` (`app v1`).
2. Write a Dockerfile in the dependency-installation order: copy deps, RUN to install, copy source.
3. Build as `cache-demo`; confirm the dependency step ran.
4. Edit `app.sh` to `app v2`, rebuild, and confirm the dependency step is CACHED.
5. Edit `deps.txt` to `dep=v2`, rebuild, and confirm the dependency step runs again.
6. State the ordering rule that makes everyday rebuilds fast.

## Tasks

- [ ] **create-project** — Create `~/cache-demo` with `deps.txt` and `app.sh`.
- [ ] **write-dockerfile** — Write a Dockerfile in dependency-installation order.
- [ ] **build-first** — Build and confirm the dependency step ran.
- [ ] **modify-source** — Edit `app.sh`; rebuild and observe the dependency step cached.
- [ ] **modify-deps** — Edit `deps.txt`; rebuild and observe the dependency step run again.
- [ ] **why-order** — Choose the ordering that keeps rebuilds fastest.

## Reflection

You watched the cache work twice. Editing the source left the dependency step untouched — CACHED — because its input (`deps.txt`) had not changed. Editing the dependency file changed that step's input, so it re-ran. That is the entire argument for the dependency-installation pattern: put expensive, rarely-changing steps first and cheap, constantly-changing source last, and most rebuilds will be near-instant.