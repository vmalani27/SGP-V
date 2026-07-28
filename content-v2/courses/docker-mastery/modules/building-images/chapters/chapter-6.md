# Chapter 6: Optimizing Images

## In this chapter, you will

- Order Dockerfile instructions for maximum cache efficiency
- Use `.dockerignore` to exclude unnecessary files
- Choose base images that minimize size and attack surface

## Why Image Size Matters

A 2 GB image takes 5 minutes to push to a registry, 5 minutes to pull on a deployment server, and uses disk space on every machine that pulls it. A 50 MB image takes seconds and uses almost no space.

Smaller images also have fewer vulnerabilities. Every package you install is a potential security hole. The less you include, the less there is to attack.

## Order Your Instructions by Change Frequency

Docker caches layers. If a layer has not changed, Docker reuses it from cache on the next build. The key insight: put things that change rarely at the top and things that change frequently at the bottom.

```
# Good ordering:
FROM node:20-alpine        # Changes: rarely (only when you upgrade Node)
WORKDIR /app                # Changes: never
COPY package*.json ./       # Changes: when dependencies change
RUN npm ci                  # Changes: when package.json changes
COPY . .                    # Changes: on every code edit
RUN npm run build           # Changes: when code or build config changes
```

The first four layers are cached after the first build. Only the last two layers rebuild when you edit code. If you swapped the order — copying all files before `npm install` — every code change would invalidate the `npm install` layer and force a full reinstall.

## Use `.dockerignore`

Just like `.gitignore`, a `.dockerignore` file tells Docker which files to exclude from the build context. This makes builds faster (fewer files to copy) and images smaller (no junk included).

Create `.dockerignore` in your project root:

```
node_modules
.git
.env
*.log
dist
coverage
.github
```

Without `.dockerignore`, `COPY . .` copies everything — including `node_modules/` (which might contain 500 MB of packages), `.git/` (which might contain your entire history), and `.env` (which contains secrets).

> **Warning:** Never copy `.env` files into a Docker image. They often contain API keys, database passwords, and other secrets. These end up in the image's layers and can be extracted with `docker history`. Use environment variables (`-e` flags) or Docker secrets for sensitive data.

## Choose the Right Base Image

Not all base images are equal:

| Base Image | Size | Use Case |
|-----------|------|----------|
| `node:20` | ~1 GB | Full Debian with Node. Good for debugging. |
| `node:20-slim` | ~200 MB | Minimal Debian with Node. Most apps work fine. |
| `node:20-alpine` | ~130 MB | Alpine Linux. Smallest, but some npm packages fail. |
| `distroless` | ~30 MB | Google's minimal images. No shell, no package manager. |

Start with `slim` or `alpine`. Only use the full image if you need system libraries that are not in the smaller variants.

For production, consider `distroless` images. They have no shell, no package manager, and no extra tools. An attacker who compromises your container cannot install tools or explore the system. The tradeoff is that debugging is harder — you cannot `docker exec` into the container and run commands.

## Combining RUN Commands

Each `RUN` instruction creates a layer. Combine related commands to reduce layers:

```
# Bad: three layers
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# Good: one layer
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*
```

The combined version also avoids caching a stale `apt-get` layer that might point to outdated package lists.

> **Tip:** Run `docker history <image-name>` to see every layer in an image, its size, and the command that created it. This is the fastest way to identify what is bloating your image.

> **Try This:** Build a Node.js app with `node:20` as the base image. Check the size with `docker images`. Then rebuild with `node:20-slim` and then `node:20-alpine`. Compare the sizes. For each, run `docker history` to see what is taking up space.

## Key Takeaways

- Order Dockerfile instructions by change frequency — rarely-changing layers at the top
- Always use `.dockerignore` to exclude `node_modules/`, `.git/`, `.env`, and other junk
- Choose the smallest base image that works for your application
- Combine `RUN` commands to reduce layers and avoid stale caches
