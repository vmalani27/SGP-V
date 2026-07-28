# Chapter 4: Writing Dockerfiles

## In this chapter, you will

- Understand what a Dockerfile is and how it works
- Write a Dockerfile for a real application
- Build an image and run it as a container

## From Manual to Automated

So far you have been running images that other people built — `nginx`, `postgres`, `hello-world`. But you need to run *your* application inside a container. That means building your own image.

A Dockerfile is a text file that contains step-by-step instructions for building an image. Think of it as a recipe: each instruction adds a layer to the image.

## The Structure of a Dockerfile

Here is a Dockerfile for a simple Node.js application:

```
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

Let's break down every line:

| Instruction | What It Does |
|-------------|-------------|
| `FROM` | Starts from an existing image. Every Dockerfile begins with `FROM`. |
| `WORKDIR` | Sets the working directory inside the container. Like `cd` but persistent. |
| `COPY` | Copies files from your machine into the container. |
| `RUN` | Executes a command during the build. The result is saved in the image. |
| `EXPOSE` | Documents which port the application uses. Does not actually publish the port. |
| `CMD` | The command that runs when the container starts. Only one `CMD` per Dockerfile. |

## The Layer Model

Every instruction in a Dockerfile creates a **layer**. Docker stacks these layers on top of each other to form the final image. This is not just an implementation detail — it directly affects how fast your builds are.

```
Layer 5:  COPY . .           (your source code)
Layer 4:  RUN npm install    (dependencies)
Layer 3:  COPY package*.json (package files only)
Layer 2:  WORKDIR /app       (working directory)
Layer 1:  FROM node:20-alpine (base image)
```

When you change something, Docker rebuilds that layer and everything above it. Layers below the change are reused from the cache. This is why the order of instructions matters — you want things that change frequently at the top and things that change rarely at the bottom.

## Building Your Image

With a Dockerfile in your project root:

```
docker build -t my-app .
```

| Part | Meaning |
|------|---------|
| `-t my-app` | Tags the image with the name `my-app` |
| `.` | The build context — the directory where Docker looks for files |

Docker reads your Dockerfile, executes each instruction, and produces an image. The first build is slow because it downloads the base image and runs every step. Subsequent builds are fast because Docker reuses cached layers.

## Running Your Image

```
docker run -d -p 3000:3000 my-app
```

Your application is now running inside a container, built from your Dockerfile. Visit `http://localhost:3000` to see it.

> **Tip:** Keep your Dockerfile in a `.dockerignore` file's consideration. Just like `.gitignore`, a `.dockerignore` file tells Docker which files to exclude from the build context. Excluding `node_modules/`, `.git/`, and test files makes your build faster and your images smaller.

> **Warning:** Do not copy your entire project including `node_modules/` into the container. The `COPY . .` line comes *after* `RUN npm install` deliberately. If you copy `node_modules/` from your machine, it might contain platform-specific binaries that do not work inside the Linux-based container.

> **Try This:** Create a simple `index.js` file with `console.log("Hello from Docker!")`. Write a Dockerfile based on `node:20-alpine`, copy the file in, and set the `CMD` to run it. Build and run the container. You should see the message in `docker logs`.

## Key Takeaways

- A Dockerfile is a step-by-step recipe for building an image
- Each instruction creates a layer; Docker caches layers to speed up rebuilds
- Put things that change rarely at the top of the Dockerfile, things that change often at the bottom
- `docker build -t <name> .` builds the image; `docker run` creates a container from it
