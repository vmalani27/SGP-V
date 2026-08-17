# Lab 7: Build Context and .dockerignore

## What You're Doing and Why

The build command takes a directory — the **build context** — and Docker only ever sees that directory. Every file inside it is available to the build; nothing outside it is. This lab makes that boundary visible: you will watch a file ride along into an image because it was in the context, then watch it disappear after you exclude it with `.dockerignore`. The lesson matters because an oversized or careless context slows builds and, worse, can quietly ship files you never meant to include.

## Background

`docker build -t name .` reads the Dockerfile from the context and copies whatever the Dockerfile asks for. `COPY . .` copies the *entire* context into the image. A `.dockerignore` file in the context root excludes matching files from that context — so the copy never sees them. Without it, everything in the project directory (including secrets and junk) is a candidate for the image.

## Command Reference

### `docker build -t <name> <context-dir>`

Builds from the Dockerfile in the given directory. The directory is the build context.

### `COPY . .`

Copies everything in the build context into the image's working directory.

### `echo '<pattern>' > .dockerignore`

Creates a `.dockerignore` excluding the given pattern from the build context.

## Scenario

You build an image from a directory that contains an application file and a file you would never want to ship. You observe both reach the image by default, then exclude the unwanted one with `.dockerignore` and rebuild to confirm it is gone.

## Objective

1. Create `~/context-demo` with `app.txt` (containing `application data`) and `secret.txt` (containing `super secret`).
2. Write a Dockerfile that `COPY . .` and lists `/app` on start.
3. Build as `context-demo` and confirm both files reach the image.
4. Add a `.dockerignore` excluding `secret.txt`.
5. Rebuild and confirm `app.txt` is present but `secret.txt` is gone.
6. Explain why `COPY` cannot reach paths outside the build context.

## Tasks

- [ ] **create-project** — Create `~/context-demo` with `app.txt` and `secret.txt`.
- [ ] **write-dockerfile** — Write a Dockerfile that copies the whole context and lists `/app`.
- [ ] **build-included** — Build and confirm both files reach the image.
- [ ] **add-dockerignore** — Add `.dockerignore` excluding `secret.txt`.
- [ ] **rebuild-excluded** — Rebuild and confirm `secret.txt` is gone from the image.
- [ ] **verify-excluded** — Confirm `app.txt` present, `secret.txt` absent.
- [ ] **outside-context** — Explain why `COPY ../other/file.txt` fails.

## Reflection

The build context is the entire universe the build can see. Everything in it is available to `COPY`, and with `COPY . .` everything in it is shipped — until `.dockerignore` removes it. Keeping the context lean is both a speed and a security practice: it makes builds faster and keeps files you do not want (secrets, history, build artifacts) out of the images you distribute.