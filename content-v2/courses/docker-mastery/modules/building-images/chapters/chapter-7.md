# Chapter 7: Build Context and .dockerignore

## In this chapter, you will

- Understand what the build context actually is
- See why `COPY` cannot access arbitrary host paths
- Know what gets sent to the Docker daemon
- Use `.dockerignore` to exclude files
- Understand the security implications of an oversized context

## What the Build Context Actually Is

Every build command ends with a path:

```
docker build -t my-app .
```

That path is the **build context** — the directory Docker reads from while building:

```
docker build
     │
     └── build context = .
                         │
                         ├── Dockerfile
                         ├── app.py
                         ├── requirements.txt
                         └── ...
```

The build context defines the exact set of files Docker makes available to the build. Everything `COPY` refers to must live inside it.

## Why `COPY` Cannot Access Arbitrary Host Paths

Because the build only sees the context, `COPY` is limited to it:

- `COPY hello.txt .` works when `hello.txt` is inside the context.
- `COPY ../sibling/something.txt .` **fails** — that file is outside the directory you handed to `docker build`.

The build context acts as a strict boundary on what the Docker daemon can access during a build. If you need a file in the image, it must live inside the build context.

## What Gets Sent to the Daemon

`docker build` runs against the Docker daemon, not on your local machine. The context is the communication channel between the two: the daemon receives the context, then executes the build from it.

Two practical consequences:

- An oversized context makes builds slower, because more data is transferred to the daemon on every build.
- Anything inside the context is, in principle, available to the build — and anything you do not need may end up shipped.

## `.dockerignore`

A **`.dockerignore`** file solves the second problem. Just like `.gitignore`, it tells Docker which files to exclude from the build context:

```
node_modules/
.git/
*.log
```

Excluding `node_modules/`, `.git/`, and test output keeps builds fast and images small. The file lives in the build context root, next to the Dockerfile.

## Common Things to Exclude

For most projects, the same list applies:

- `node_modules/` — thousands of packages you do not want to send to the daemon
- `.git/` — your entire repository history
- `.env` — secrets; never let these reach an image
- Test output, build artifacts (`dist/`, `coverage/`, `*.log`)

> **Warning:** Never ship a `node_modules/` copied from your machine into a Linux container. Those files may contain platform-specific binaries that do not work inside the container.

## Security Implications

The build context is a small but real attack surface. If a directory accidentally contains credentials or private data, and nothing excludes them, they end up inside the image's layers — where anyone with access to the image can read them later with `docker history`. `.dockerignore` is the standard tool to keep secrets and unnecessary artifacts out of the build, and out of the images you ship.

## Walkthrough: Build Context in Action with express-app

The workspace provides a pre-configured sample project at `~/express-app`. Inspect its structure:

```bash
cd ~/express-app
ls -la
```

```text
total 24
drwxr-xr-x 2 student student 4096 Nov 23 05:54 .
-rw-r--r-- 1 student student   42 Nov 23 05:54 .dockerignore
-rw-r--r-- 1 student student  123 Nov 23 05:54 Dockerfile
-rw-r--r-- 1 student student  173 Nov 23 05:54 package.json
-rw-r--r-- 1 student student  273 Nov 23 05:54 server.js
```

### Inspecting Context Exclusions

Examine the exclusion patterns in `.dockerignore`:

```bash
cat .dockerignore
```

```text
node_modules
npm-debug.log
.git
.DS_Store
```

The Dockerfile contains `COPY . .`, which attempts to copy everything in the directory into the container. Because `node_modules` and `.git` are listed in `.dockerignore`, Docker filters them out before transferring the context to the builder daemon.

### Building the Sample Image

Build the container image using `~/express-app` as the build context (`.`):

```bash
docker build -t express-demo .
```

The Docker daemon receives only the application source files, executes `npm install` inside the Linux build container to download runtime dependencies, and saves the image to the local store.

### Running and Verifying the Container

Start a background container named `my-express` and map host port 3000 to container port 3000:

```bash
docker run -d --name my-express -p 3000:3000 express-demo
```

Test that the web service is operational:

```bash
curl http://localhost:3000
```

```json
{"status":"ok","message":"Hello from inside the container!"}
```

Stop and remove the demonstration container:

```bash
docker rm -f my-express
```

## Key Takeaways

- The **build context** is the directory Docker reads during a build; `COPY` can only see files inside it.
- The context is sent to the daemon, so an oversized context slows builds and can leak files.
- `.dockerignore` excludes files from the context — keep `node_modules/`, `.git/`, `.env`, and artifacts out.
- Files that reach the image stay in its layers, so exclude secrets deliberately.