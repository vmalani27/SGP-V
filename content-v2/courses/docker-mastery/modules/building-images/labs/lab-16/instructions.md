# Lab 16: Build Context and Secrets

## What You're Doing and Why

When you run `docker build`, Docker sends the entire build context to the daemon — every file in the directory. If secrets like `.env` files or API keys are in that directory, they get copied into the image layers. This lab teaches you to detect leaked secrets and use `.dockerignore` to keep them out of your images.

## Command Reference

### `docker build -t <name> <path>`

Builds an image from a Dockerfile in the specified directory.

### `docker history <image>`

Shows the layers and commands used to build an image. Use `--no-trunc` to see full output.

### `docker run --rm --entrypoint cat <image> <file>`

Runs a container with a custom entrypoint to read a file from the image filesystem.

### `.dockerignore`

A file in the build context root that lists files/patterns to exclude from the build. Works like `.gitignore`.

## Scenario

You have a Python application with sensitive configuration files (`.env`, `config.json`) in the project directory. You need to build a Docker image without leaking these secrets into the image layers.

## Objective

1. Create a project with application code and secret files
2. Build an image without `.dockerignore` and observe secrets in the image
3. Use `docker history` to detect leaked secrets
4. Create `.dockerignore` to exclude secrets
5. Rebuild and verify secrets are excluded from the image

## Reflection

Secrets baked into image layers are visible to anyone who pulls the image. They can be extracted with `docker history` or by inspecting the image filesystem. Always use `.dockerignore` to exclude sensitive files, and consider using Docker secrets or runtime environment variables for production credentials.
