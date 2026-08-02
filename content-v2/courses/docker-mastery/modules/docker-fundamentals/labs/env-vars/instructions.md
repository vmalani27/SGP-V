# Lab 3: Environment Variables and Container Configuration

## What You're Doing and Why

A container image is built once but should run in many environments: development, staging, production. Hard-coding configuration values like database hostnames or API keys into an image would mean rebuilding it for every environment. Environment variables solve this by injecting configuration at runtime, keeping the image generic and the configuration separate.

## Background

Environment variables are key-value pairs that are visible to every process running inside the container. They are set using the `-e` flag at runtime or defined in the Dockerfile using the `ENV` instruction. Values set at runtime override values set in the image. This is the standard mechanism for twelve-factor application configuration, and virtually every database, cache, and web framework reads its configuration from environment variables by default.

## Command Reference

### `docker run -e KEY=value <image>`

Sets an environment variable inside the container.

### `docker run --env-file .env <image>`

Reads environment variables from a file and passes them all to the container.

### `docker exec <container> env`

Lists all environment variables visible inside a running container.

## Scenario

Run a PostgreSQL container using environment variables to set the database name, username, and password. Verify that the database started correctly by connecting to it.

## Objective

Run `postgres:15` passing `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` as environment variables. Confirm the database is accepting connections.

## Reflection

Never pass secret values directly on the command line in a production environment. Command-line arguments are visible in process listings and shell history. For secrets, Docker provides a secrets mechanism and most orchestration platforms have their own secret management. For local development, `--env-file` with a `.env` file that is excluded from version control is the accepted practice.
