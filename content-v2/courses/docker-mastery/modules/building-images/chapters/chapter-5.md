# Chapter 5: Building Your Own Images

## In this chapter, you will

- See where images come from and why you need to build your own
- Meet the Dockerfile and how it fits between your code and a container
- Keep the three objects straight: Dockerfile, image, container
- Build your first minimal image
- Learn what `FROM`, `COPY`, and `CMD` do
- Understand the build context

## From Using Images to Building Images

So far you have been running images other people already built:

```bash
docker run nginx:alpine
docker run alpine echo "hello"
```

Everything worked out of the box — but only because those images already existed. Somewhere, someone had to build them before you could run them.

You already know the bottom half of the story:

```text
Docker image
      ↓
docker run
      ↓
Container
```

Now you have *your own* application, and there is no pre-built image waiting for it:

```text
Your application
      ↓
     ????
      ↓
Docker image
      ↓
Container
```

The missing question is:

> **How do we turn an application into an image?**

That is the problem this chapter solves.

## The Dockerfile

A **Dockerfile** is a text file containing instructions Docker uses to build an image.

```dockerfile
FROM python:3.12-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .

CMD ["python", "app.py"]
```

Do not worry about every instruction yet. For now, the important thing is the relationship the Dockerfile completes:

```text
Dockerfile
    │
    │ docker build
    ▼
Docker image
    │
    │ docker run
    ▼
Container
```

`docker build` builds an image from a Dockerfile, and `docker run` creates a container from that image. That is the whole reason a Dockerfile exists: to describe, in plain text, what an image should contain and how it should start.

## Dockerfile, Image, Container

These three objects are related, but they are not interchangeable.

- The **Dockerfile** is instructions — a text document that describes *how to build*.
- The **image** is the built artifact — the packaged result that contains everything the container needs.
- The **container** is the runtime instance — a *runnable instance of an image*. It can be running or stopped.

Put them in a row and the flow is one-way:

```text
Dockerfile
   │
   │ docker build
   ▼
Image
   │
   │ docker run
   ▼
Container
```

> **A Dockerfile is not an image. An image is not a container.**

- The Dockerfile is the plan.
- The image is the result of executing the plan.
- The container is an instance of that result — created by `docker run`, and able to exist in either a running or a stopped state, exactly as you saw in Chapter 2.

## Your First Dockerfile

Build something real before any more theory. You will create a directory with a single file and a tiny Dockerfile that prints it.

Create a directory and add one file:

```text
my-first-image/
├── Dockerfile
└── hello.txt
```

**Save the Dockerfile with no extension** — the filename is `Dockerfile`, exactly that. Docker uses this filename by default when you run `docker build`, so it does not need to be passed explicitly.

Dockerfile:

```dockerfile
FROM alpine:latest

COPY hello.txt /

CMD ["cat", "/hello.txt"]
```

Build the image:

```bash
docker build -t my-first-image .
```

Then run it:

```bash
docker run --rm my-first-image
```

You see the contents of `hello.txt` printed, and the container exits. Follow what you just did:

```text
hello.txt
    +
Dockerfile
    │
    │ docker build
    ▼
my-first-image   ← the image
    │
    │ docker run
    ▼
container
    │
    ▼
cat /hello.txt
```

Try it — the steps below load each command into the terminal for you. Click **Run this next**, review the command, then press Enter:

:::terminal-demo
id: build-first-image
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
state:
  label: my-first-image
  command: >-
    docker image ls --format '{{.Repository}}:{{.Tag}}' 2>/dev/null |
    grep -q '^my-first-image:' && echo built || echo "not built yet"
steps:
  - id: create-project
    label: Create the project directory and file
    run: mkdir -p ~/my-first-image && echo "hello from my image" > ~/my-first-image/hello.txt
    expect: |
      Nothing is printed — the commands succeed silently. `~/my-first-image`
      now exists and holds `hello.txt`.
  - id: write-dockerfile
    label: Write the Dockerfile
    run: printf 'FROM alpine:latest\n\nCOPY hello.txt /\n\nCMD ["cat", "/hello.txt"]\n' > ~/my-first-image/Dockerfile
    expect: |
      Nothing is printed. The file is named exactly `Dockerfile` — no
      extension — because `docker build` looks for that name by default.
  - id: enter-context
    label: Enter the build context
    run: cd ~/my-first-image
    expect: |
      Your prompt's directory changes. This directory is the **build context**
      — the only place `docker build` can read files from, so `COPY` can find
      `hello.txt`.
  - id: build-image
    label: Build the image
    run: docker build -t my-first-image .
    expect: |
      Build steps run, ending in `Successfully tagged my-first-image:latest`,
      and the state chip flips to `built`. The `.` is the build context you
      just entered.
  - id: list-image
    label: Confirm the image exists
    run: docker image ls
    expect: |
      A row for `my-first-image` with the `alpine` tag — the built artifact is
      stored on this system, separate from any container.
  - id: run-image
    label: Run a container from it
    run: docker run --rm my-first-image
    expect: |
      `hello from my image` is printed, then the container exits — the `CMD`
      ran at container start.
examples:
  - docker run --rm my-first-image sh -c 'cat /hello.txt'
  - docker image history my-first-image
  - docker image inspect my-first-image --format '{{.Os}}/{{.Architecture}}'
  - docker build -t my-first-image:v2 . && docker run --rm my-first-image:v2
:::

## What Happened During the Build?

You just used three instructions. Here is what each one did:

| Instruction | Job                                  |
| ----------- | ------------------------------------ |
| `FROM`      | Choose the starting image for the build. |
| `COPY`      | Put files into the image.            |
| `CMD`       | Define the default command for a container created from the image. |

Your Dockerfile:

```dockerfile
FROM alpine:latest
COPY hello.txt /
CMD ["cat", "/hello.txt"]
```

- **`FROM alpine:latest`** — the build starts from an existing image; your own content is added on top of it.
- **`COPY hello.txt /`** — copies `hello.txt` into the image's filesystem, at `/`.
- **`CMD ["cat", "/hello.txt"]`** — the command a container runs when it starts. Because the file lives at `/hello.txt`, `cat` is able to print it.

Inspect the result to make the separation concrete:

```bash
docker image ls
docker image inspect my-first-image
```

`docker image ls` lists images as stored artifacts; `docker image inspect` shows the metadata and configuration Docker recorded for yours. The image is a thing that exists on disk — not the running container you saw a moment ago.

## Where Did `hello.txt` Come From?

Look back at the build command:

```bash
docker build -t my-first-image .
```

What does the `.` mean? It is the **build context** — the directory Docker reads from while building, so `COPY` and `ADD` can reference files inside it. A build can only see files that live within this directory; anything outside it is invisible to the builder.

```text
my-first-image/
├── Dockerfile
├── hello.txt   ← available to COPY
└── src/        ← also inside the context
```

```bash
docker build -t my-first-image .
                              ↑
                         build context
```

The context is what Docker sends to the builder, and the builder turns it into an image:

```text
my-first-image/         (build context)
   ├── Dockerfile
   ├── hello.txt
   └── src/
        │
        ▼
      builder
        │
        ▼
      image
```

That is why `COPY hello.txt /` was able to find the file: it was sitting in the same directory as the Dockerfile, inside the build context.

## From Tiny Image to Application

You now understand the mechanics, so add the last missing pieces. An application image for a Python service uses a few more instructions:

```dockerfile
FROM python:3.12-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .

CMD ["python", "app.py"]
```

Map every line:

| Instruction | Job                                                  |
| ----------- | ---------------------------------------------------- |
| `FROM`      | Starting point — the base image.                     |
| `WORKDIR`   | The directory inside the image where work happens.   |
| `COPY`      | Application files into the image.                    |
| `RUN`       | Run a command *while building* (here: install dependencies). |
| `CMD`       | The command a container runs *at start*.             |

`RUN` runs at build time; `CMD` runs at run time. Together they express what a virtual environment can only approximate: an isolated Python environment, described as instructions and frozen into a portable image — buildable and runnable anywhere Docker is installed, with none of the setup steps repeated by hand.

## Key Takeaways

- Images do not appear by themselves — someone built every image you have been running.
- A **Dockerfile** is a text file of instructions; `docker build` turns it into an **image**; `docker run` turns the image into a **container**.
- The three objects are not interchangeable: Dockerfile = instructions, image = built artifact, container = runnable instance (running or stopped).
- `.` at the end of `docker build -t name .` names the **build context** — the directory the builder can read, and the only place `COPY` can pull files from.
- A tiny first image (copy a file, print it) teaches the pipeline faster than a full application does.