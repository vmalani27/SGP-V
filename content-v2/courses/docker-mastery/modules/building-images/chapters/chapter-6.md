# Chapter 6: Dockerfile Fundamentals

## In this chapter, you will

- Learn the common instructions: `FROM`, `WORKDIR`, `COPY`, `RUN`, `CMD`, `EXPOSE`
- Distinguish build-time from run-time
- See why instruction order matters
- Understand what actually happens during `docker build`

## The Common Instructions

Once the tiny example makes sense, the common instructions are easy to place:

| Instruction | Purpose |
|-------------|---------|
| `FROM` | Selects the base image the build starts from |
| `WORKDIR` | Sets the working directory inside the container; like `cd`, but persistent |
| `COPY` | Copies files from your machine into the image |
| `RUN` | Executes a command while building the image; the result is saved in the image |
| `CMD` | Defines the default command when the container starts; one `CMD` per Dockerfile |
| `EXPOSE` | Documents the application's intended container port; does not publish it |

## Build-Time vs Run-Time

The two kinds of instructions are easy to confuse, so keep them apart:

- **Build-time** instructions run while the image is being built. Their effects are frozen into the image. `RUN` is the main one — when you `RUN apt-get install`, the package is installed into a layer of the image, not into any running container.
- **Run-time** instructions describe what happens when a container starts from the finished image. `CMD` is the main one. It never runs during the build.

`COPY` is a bridge between the two: it runs during the build (to get files into the image), but the files it places are there for the container at run time.

`WORKDIR` is a small but important habit: it makes every path after it relative to that directory, so you do not have to repeat `/app/` everywhere.

## What Happens During `docker build`

When you run `docker build`, Docker:

1. Reads the Dockerfile from the build context.
2. Starts from the `FROM` image.
3. Works through the instructions in order, one by one.
4. Saves the result as your image.

The details of layers and caching come later — for now, the mental model is: instructions run top to bottom, and each one builds on the previous.

## Why Order Matters

Because build-time instructions actually execute, their order changes what happens. Two observations:

- **One `CMD` per Dockerfile.** If you write two, only the last one counts.
- **Instructions above a change do not re-run; instructions below it do.** This is the caching behavior that makes ordering important — put things that change rarely at the top and things that change often at the bottom.

A classic ordering pattern:

```
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

- `FROM node:20-alpine` starts from an image that already has Node.js installed.
- `WORKDIR /app` makes `/app` the current directory for everything after it.
- `COPY package*.json ./` copies just the dependency manifest, and `RUN npm install` installs dependencies during the build.
- `COPY . .` copies the rest of your application.
- `EXPOSE 3000` documents the port, and `CMD` sets the command that runs at start.

The dependency install comes *before* the source copy on purpose — you will see exactly why in the layer-caching lesson.

> **Try This:** Take the tiny `hello.txt` image from the last lesson and extend it: add a `RUN` that creates a directory or installs a small package, and an `EXPOSE` line. Rebuild and confirm the build runs your instruction and the image still works.

## Key Takeaways

- `FROM`, `WORKDIR`, `COPY`, `RUN`, `CMD`, and `EXPOSE` cover most Dockerfiles.
- Build-time instructions (`RUN`) are frozen into the image; run-time instructions (`CMD`) run when a container starts.
- `docker build` works through the Dockerfile top to bottom, one instruction at a time.
- Order matters: one `CMD` counts, and rarely-changing instructions go at the top.