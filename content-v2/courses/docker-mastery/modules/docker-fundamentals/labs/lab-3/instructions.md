# Lab 3: Environment Variables and Container Configuration

## What You're Doing and Why

A container image is built once but should run in many environments: development, staging, production. Hard-coding configuration values like database hostnames or API keys into an image would mean rebuilding it for every environment. Environment variables solve this by injecting configuration at runtime, keeping the image generic and the configuration separate. This lab puts that into practice: you pass a variable into a container and map a host port to a container port so you can reach the container from your machine.

## Background

Environment variables are key-value pairs that are visible to every process running inside the container. They are set using the `-e` flag at runtime or defined in the Dockerfile using the `ENV` instruction. Values set at runtime override values set in the image. Publishing a port with `-p` makes a container's port reachable from the host: `-p 9090:80` forwards host port 9090 to container port 80. This is how you access a web server running inside a container from your browser.

## Command Reference

### `docker run -e KEY=value <image>`

Sets an environment variable inside the container.

### `docker run --env-file .env <image>`

Reads environment variables from a file and passes them all to the container.

### `docker run -p HOST:CONTAINER <image>`

Maps a container port to a port on the host.

### `docker port <container>`

Lists the port mappings of a running container.

### `docker exec <container> env`

Lists all environment variables visible inside a running container.

## Scenario

Run an alpine container that prints the value of an environment variable, then start an nginx container and publish host port 9090 to the container's port 80. Verify the port mapping.

## Objective

Run `docker run --rm -e MY_VAR=hello alpine printenv MY_VAR` and confirm the output is `hello`. Then run `docker run -p 9090:80 nginx:alpine` and use `docker port` to confirm host port 9090 maps to the container's port 80.

## Reflection

Environment variables let you reconfigure an image without rebuilding it, and port mapping is what makes containers reachable from outside. Never pass secret values directly on the command line in a production environment — command-line arguments are visible in process listings and shell history. For secrets, Docker provides a secrets mechanism and most orchestration platforms have their own secret management. For local development, `--env-file` with a `.env` file that is excluded from version control is the accepted practice.
