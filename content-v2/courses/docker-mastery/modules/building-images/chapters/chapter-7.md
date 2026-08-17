# Chapter 7: Build Context and `.dockerignore`

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

The context is not just "the folder with the Dockerfile". It is the set of files Docker makes available to the build. Everything `COPY` refers to must live inside it.

## Why `COPY` Cannot Access Arbitrary Host Paths

Because the build only sees the context, `COPY` is limited to it:

- `COPY hello.txt .` works when `hello.txt` is inside the context.
- `COPY ../sibling/something.txt .` **fails** — that file is outside the directory you handed to `docker build`.

This is not a limitation you can work around with paths; it is the boundary of what the build is allowed to see. If you need a file in the image, it must be inside the build context.

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

The build context is a small but real attack surface. If a directory accidentally contains credentials or private data, and nothing excludes them, they end up inside the image's layers — where anyone with access to the image can read them later with `docker history`. `.dockerignore` is the cheap way to keep secrets and junk out of the build, and out of the images you ship.

> **Try This:** In a project directory, create a large or secret file (say, `secret.txt` and a `node_modules/` directory with a dummy file inside). Build without a `.dockerignore` and confirm the build context is larger; then add a `.dockerignore` excluding both and rebuild — the build should be faster and the image should not contain them.

## Key Takeaways

- The **build context** is the directory Docker reads during a build; `COPY` can only see files inside it.
- The context is sent to the daemon, so an oversized context slows builds and can leak files.
- `.dockerignore` excludes files from the context — keep `node_modules/`, `.git/`, `.env`, and artifacts out.
- Files that reach the image stay in its layers, so exclude secrets deliberately.