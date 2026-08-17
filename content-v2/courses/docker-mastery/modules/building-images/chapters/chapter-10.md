# Chapter 10: Multi-Stage Builds

## In this chapter, you will

- Understand why single-stage images get bloated
- Use multi-stage builds to separate build time from runtime
- Produce dramatically smaller production images

## The Bloat Problem

Look at this Dockerfile for a Go application:

```
FROM golang:1.22

WORKDIR /app
COPY . .
RUN go build -o server .

CMD ["./server"]
```

This works, but the final image contains the Go compiler, all the source code, build tools, and the compiled binary. The binary is 10 MB. The image is 800 MB.

You do not need the Go compiler in production. You only need the binary. The compiler was useful during the build, but it is dead weight in the running container.

## How Multi-Stage Builds Work

A multi-stage Dockerfile has multiple `FROM` statements. Each `FROM` starts a new stage. You can copy artifacts from one stage to another, leaving behind everything you do not need.

```
# Stage 1: Build
FROM golang:1.22 AS builder
WORKDIR /app
COPY . .
RUN go build -o server .

# Stage 2: Production
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/server .
CMD ["./server"]
```

Two stages, two images — but only the second one is the final image. Here is what happens:

| Stage | Base Image | What Happens |
|-------|-----------|-------------|
| `builder` | `golang:1.22` | Compiles the Go binary. Includes the full Go toolchain. |
| Final | `alpine:3.19` | Copies only the binary from the builder stage. Tiny base image. |

The `COPY --from=builder` instruction reaches into the first stage and grabs the compiled binary. Everything else from the builder stage — the compiler, source code, intermediate files — is discarded.

The result: a 800 MB image becomes a 15 MB image. Same binary, fraction of the size.

## Real-World Example: Node.js

```
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
RUN npm prune --production

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The build stage installs all dependencies (including dev dependencies like TypeScript) and builds the project. The production stage copies only the compiled output and production dependencies. Dev tools are left behind.

## When to Use Multi-Stage Builds

Use multi-stage builds when:

- Your build tools are large (compilers, bundlers, test frameworks)
- You want to separate build-time dependencies from runtime dependencies
- You need small, fast-starting production images

You do not need multi-stage builds when:

- You are using a base image that is already minimal
- Your application does not have a separate build step (e.g., plain Python scripts)

> **Tip:** A common pattern is to name your stages with `AS builder` (or any name you choose) and reference them by name in `COPY --from=<name>`. This makes your Dockerfile readable and maintainable.

> **Warning:** Multi-stage builds do not automatically make your image secure. If your application has vulnerabilities in its runtime dependencies, they will still be in the final image. Multi-stage builds reduce surface area by removing build tools, but you still need to audit your runtime dependencies.

> **Try This:** Take a simple Python script that uses `requests`. Write a single-stage Dockerfile that installs Python and runs the script. Check the image size with `docker images`. Then rewrite it as a multi-stage build: install dependencies in a build stage, copy only the virtual environment to a slim final stage. Compare the sizes.

## Key Takeaways

- Multi-stage builds separate the build environment from the production environment
- Use `COPY --from=<stage>` to grab artifacts from earlier stages
- The final image contains only what you explicitly copy — build tools are left behind
- This can reduce image sizes from hundreds of megabytes to tens of megabytes
