# Chapter 5: From Containers to Images

## In this chapter, you will

- See the problem Dockerfiles solve
- Keep the three objects straight: Dockerfile, image, container
- Follow the pipeline from a Dockerfile to a running container
- Get a first look at the build context
- Build your first minimal image

## What Problem Dockerfiles Solve

So far you have been consuming images other people built:

```
docker run nginx:alpine
docker run alpine echo "hello"
```

`nginx:alpine` is an existing image — a pre-built package. Docker creates a container from it, and the image already contains everything the application needs.

But what if you have *your own* application?

```
my-application/
├── app.py
├── requirements.txt
└── ...
```

You could do it the manual way: create a container from a base OS image, install Python inside it, copy your application in, install dependencies, configure everything, and start it. That works — once. The next time you want a fresh environment, or a teammate wants the same setup, you repeat every step by hand. Slow, error-prone, impossible to reproduce reliably.

This is the problem **Dockerfiles** solve.

## Image vs Container vs Dockerfile

Before diving into syntax, make sure you know the object you are building.

> A **Docker image** is a packaged filesystem and a set of metadata that can be used to create containers.

The image carries the application's files, its dependencies, its runtime configuration, and the command that starts it. A container is just a running instance of that image.

> A **Dockerfile** is a text file containing instructions Docker uses to construct an image.

Think of it as a recipe — a set of build instructions.

Now state the distinction explicitly, because it is the single most important idea in this section:

> **A Dockerfile is not an image. An image is not a container.**

- The **Dockerfile** is the plan.
- The **image** is the result of executing the plan.
- The **container** is a running instance of the image.

## The Pipeline

You already know the flow from an image down to a running application:

```
Docker image
     ↓
docker run
     ↓
Container
```

Now add the step that comes *before* the image:

```
Dockerfile
     ↓
docker build
     ↓
Docker image
     ↓
docker run
     ↓
Container
```

That is the whole story of this section: a Dockerfile turns source code into an image, and an image turns an application into a container.

The name of the file matters: it is called `Dockerfile` — no extension. Docker looks for it automatically when you build.

## A First Look at the Build Context

The build command ends with a dot:

```
docker build -t my-app .
```

That dot is the **build context** — the directory Docker reads from while building. For now, just notice it: `COPY` can only access files inside this directory. You will work with it in depth in a later lesson.

## Build a Very Small Image First

The best way to learn `FROM`, `COPY`, and `CMD` is not a full application — it is almost nothing at all.

Create a directory, add a single file:

```
hello.txt
```

Then write a Dockerfile next to it:

```
FROM alpine:latest

WORKDIR /app

COPY hello.txt .

CMD ["cat", "hello.txt"]
```

Build the image:

```
docker build -t my-first-image .
```

Then run it:

```
docker run --rm my-first-image
```

You see the contents of `hello.txt` printed, and the container exits. Follow what you just did:

```
hello.txt
    ↓
Dockerfile COPY
    ↓
image
    ↓
container
    ↓
cat hello.txt
```

Your file went into the image, the image became a container, and the container ran your command. `FROM` chose the starting point, `COPY` carried your file into the image, and `CMD` decided what runs at start.

> **Try This:** Make the tiny image yourself. Create a directory with a `hello.txt` file and the Dockerfile above, then build and run it. Confirm that `docker image ls` lists your image and that `docker run --rm my-first-image` prints your file's contents.

## Key Takeaways

- Dockerfiles exist so you can build images reproducibly instead of configuring containers by hand.
- The **Dockerfile** is the plan, the **image** is the result, and the **container** is a running instance — they are three distinct things.
- The `.` in `docker build -t name .` is the **build context**, the directory Docker reads from while building.
- A tiny first image (copy a file, print it) teaches the pipeline faster than a full application does.