# Chapter 10: Multi-Stage Builds

## In this chapter, you will

- Distinguish between build-time compilation tools and production runtime requirements
- Diagnose image bloat and security exposure caused by shipping development dependencies
- Author multi-stage Dockerfiles using `FROM ... AS <stage>` and `COPY --from=<stage>`
- Apply production container standards from `goldbergyoni/nodebestpractices` (cache hygiene, unprivileged users, and direct process bootstrapping)
- Measure image size reduction and verify that build tools are eliminated from production containers

## The Problem We Are Solving

Modern applications rarely ship raw source code directly. In professional development, you write code with compilers like TypeScript, bundlers, and type packages (`@types/*`). While these tools are essential during development, they are completely unnecessary once your code is compiled into production JavaScript.

In a traditional single-stage Dockerfile, every tool installed to build the application stays permanently frozen into the final image layers. As highlighted in the industry-standard [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices) guide, shipping compilers and `devDependencies` into production causes two critical problems:

1. **Massive Container Bloat:** A minimal microservice easily swells to **283 MB disk usage** (with a **64 MB** compressed content size) because the TypeScript compiler, type definitions, and package manager caches remain locked inside the image.
2. **Expanded Attack Surface:** Build-time tools like compilers, package managers, and development linters provide attackers with reconnaissance and exploitation utilities if a container is compromised.

Multi-stage builds solve this by allowing multiple `FROM` instructions in a single Dockerfile. You compile your application in a temporary builder stage, copy *only* the compiled artifacts into a clean, minimal runtime stage, and discard everything else.

## Concept & Project Layout

We will examine a real-world microservice (`order-service`) structured according to the 3-tier component architecture recommended in `nodebestpractices`:

The starter application is prepared in your lab environment at `~/order-service`:

```text
order-service/
├── .dockerignore
├── Dockerfile.single       # Single-stage build (for comparison)
├── Dockerfile              # Production multi-stage build
├── package.json
├── tsconfig.json
└── src/
    ├── api/
    │   └── order-routes.ts # HTTP routing and endpoints
    ├── domain/
    │   └── order-service.ts# Business domain logic
    └── server.ts           # Service bootstrap and port binding
```

### `package.json`

Notice the clear boundary between runtime libraries and development tooling:

```json
{
  "name": "order-service",
  "version": "1.0.0",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.7"
  }
}
```

### The Architecture of a Multi-Stage Dockerfile

A multi-stage Dockerfile creates distinct stages. Each stage starts fresh from a base image:

```text
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: AS builder (node:20-alpine)                       │
│ - Copies package.json, package-lock.json, tsconfig.json    │
│ - Installs ALL dependencies (including TypeScript compiler) │
│ - Compiles TypeScript: src/*.ts  -->  dist/*.js             │
└──────────────────────────────┬──────────────────────────────┘
                               │  COPY --from=builder /usr/src/app/dist ./dist
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Production Runtime (node:20-alpine)                │
│ - Installs ONLY production dependencies (npm ci --omit=dev) │
│ - Drops npm cache (npm cache clean --force)                 │
│ - Receives only compiled dist/ directory                    │
│ - Drops compiler, devDependencies, and raw TypeScript source│
│ - Runs as unprivileged non-root user (USER node)            │
└─────────────────────────────────────────────────────────────┘
```

Here is the complete multi-stage `Dockerfile`:

```dockerfile
# ── Stage 1: Build & Compile ──────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npx tsc

# ── Stage 2: Production Runtime ───────────────────────────────
FROM node:20-alpine

WORKDIR /usr/src/app

# Install production-only dependencies and clean cache (nodebestpractices 8.5 & 8.13)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy only compiled JavaScript from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Run as non-root user (nodebestpractices 8.1 / security)
USER node

EXPOSE 3000

# Bootstrap using node directly, avoiding npm start (nodebestpractices 8.2)
CMD ["node", "dist/server.js"]
```

## Hands-On Execution & Terminal Steps

Let's walk through the full lifecycle: generating local dependencies on the host, observing single-stage bloat, and building the optimized multi-stage image.

Try it — click **Run this next**, review each command, and press Enter:

:::terminal-demo
id: multi-stage-builds
image: labops-docker-build:latest
pre_pull:
  - node:20-alpine
state:
  label: order-api
  command: docker inspect -f '{{.State.Status}}' order-api 2>/dev/null || echo "not running"
steps:
  - id: prepare-local-env
    label: Install project dependencies on the host machine
    run: cd ~/order-service && npm install && ls -la
    expect: |
      Running `npm install` creates `node_modules/` (containing TypeScript and type definitions)
      and generates `package-lock.json` directly in your workspace.
  - id: audit-dockerignore
    label: Verify context protection in .dockerignore
    run: cat ~/order-service/.dockerignore
    expect: |
      Notice that `node_modules` and `dist` are excluded. Because you just generated
      a local `node_modules` directory, `.dockerignore` prevents Docker from copying
      hundreds of megabytes of host modules into your image build context!
  - id: inspect-single-stage
    label: Review the naive single-stage Dockerfile
    run: cat ~/order-service/Dockerfile.single
    expect: |
      Notice that this Dockerfile uses a single `FROM node:20-alpine`, runs `npm install`,
      and compiles TypeScript in place with `npx tsc`.
  - id: build-single
    label: Build the single-stage image
    run: cd ~/order-service && docker build -t order-service:single -f Dockerfile.single .
    expect: |
      The single-stage image builds, freezing the TypeScript compiler, devDependencies,
      and source files into the final image layers.
  - id: check-single-size
    label: Inspect the single-stage image size and disk usage
    run: docker images order-service:single
    expect: |
      The single-stage image consumes approximately 245–283 MB of disk usage (~60–64 MB
      compressed content size). Over half of that space is build-time dead weight!
  - id: inspect-multistage
    label: Review the multi-stage Dockerfile
    run: cat ~/order-service/Dockerfile
    expect: |
      Notice the two `FROM` instructions, the `AS builder` stage name, and
      the `COPY --from=builder /usr/src/app/dist ./dist` directive.
  - id: build-multi
    label: Build the multi-stage image
    run: cd ~/order-service && docker build -t order-service:multi .
    expect: |
      Docker builds the builder stage, compiles TypeScript, switches to a clean
      new `node:20-alpine` stage, installs only production dependencies, and
      extracts the compiled `dist/` directory.
  - id: compare-sizes
    label: Compare image sizes side-by-side
    run: docker images | grep order-service
    expect: |
      `order-service:multi` drops down to ~135–199 MB disk usage (~49 MB content size).
      Over 50–80 MB of build dead weight has been completely eliminated!
  - id: run-production
    label: Run the multi-stage container
    run: docker run -d -p 3000:3000 --name order-api order-service:multi
    expect: |
      The container launches in detached mode, and the state chip switches to `running`.
  - id: verify-health
    label: Verify the service is responding
    run: curl -i http://localhost:3000/api/health
    expect: |
      HTTP/1.1 200 OK with `{"status":"healthy"}`. The compiled application runs
      flawlessly without the compiler present.
examples:
  - docker ps --filter name=order-api
  - docker logs order-api
:::

## The Learning Loop (Cause & Effect)

Now verify the security and hygiene benefits: are the build tools truly gone from the production container?

Run these checks in the live terminal below:

:::terminal-demo
id: multi-stage-builds
image: labops-docker-build:latest
pre_pull:
  - node:20-alpine
steps:
  - id: verify-compiler-stripped
    label: Verify the TypeScript compiler is absent in production
    run: docker exec order-api test -f ./node_modules/.bin/tsc && echo "COMPILER_FOUND" || echo "COMPILER_NOT_FOUND"
    expect: |
      Outputs `COMPILER_NOT_FOUND`. In `order-service:single`, `./node_modules/.bin/tsc`
      was present. In `order-service:multi`, the compiler binary does not exist!
  - id: check-user
    label: Verify container runs as non-root user
    run: docker exec order-api whoami
    expect: |
      Outputs `node`, not `root`. This adheres to `nodebestpractices` security guidelines
      to prevent privilege escalation.
  - id: inspect-history
    label: Compare layer histories
    run: docker history order-service:multi
    expect: |
      Look at the image layers. The heavy `npm ci` of devDependencies and the
      `npx tsc` compilation step do not appear anywhere in this image's history.
:::

## Common Pitfalls & Anti-Patterns

### 1. Forgetting `.dockerignore` When Generating Local Dependencies
When you run `npm install` locally on your host machine, your project workspace gets a local `node_modules/` folder. If you forget to add `node_modules` to `.dockerignore`, `COPY . .` transfers host modules (which may contain OS-specific native binaries) straight into the Docker build context, breaking container portability.

### 2. Running `npm ci` Without a `package-lock.json`
`npm ci` (Clean Install) installs strictly from `package-lock.json` without modifying it. If your project directory does not contain `package-lock.json`, `npm ci` fails with `ENOENT: package-lock.json or npm-shrinkwrap.json is required for npm ci`. Always ensure `package-lock.json` is generated and committed.

### 3. Running Production Containers as `root`
By default, Docker containers run as `root` (UID 0). If an attacker finds a remote code execution vulnerability in your application, they gain root privileges inside the container namespace. In official Node images, always declare `USER node` before running the app.

### 4. Bootstrapping with `npm start` Instead of `node`
In production containers, executing `CMD ["npm", "start"]` wraps the process in an npm parent shell that does not properly forward Linux signals (such as `SIGTERM` and `SIGINT`). This causes `docker stop` to hang for 10 seconds before forcefully killing the container with `SIGKILL`. Always start the compiled JavaScript directly with `CMD ["node", "dist/server.js"]`.

### 5. Retaining the Package Manager Cache
`npm` keeps tarballs of downloaded packages in `~/.npm`. In production layers, chaining `npm cache clean --force` after `npm ci --omit=dev` prevents cached archives from needlessly inflating your image layers.

## Key Takeaways

- Multi-stage builds separate the build environment from the production runtime using multiple `FROM` instructions.
- Use `AS <stage-name>` to label an intermediate stage, and `COPY --from=<stage-name>` to extract only compiled artifacts.
- In Node.js applications, always use `npm ci --omit=dev` in the final stage to keep development tools like TypeScript and linters out of production.
- Production images should follow security best practices: clean the package manager cache, run as an unprivileged user (`USER node`), and bootstrap processes directly with `node` rather than `npm start`.
