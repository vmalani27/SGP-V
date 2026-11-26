# Chapter 5: Building Your Own Images

## Learning Objectives

- Understand the relationship between Dockerfiles, images, and containers
- Write a minimal Dockerfile using `FROM`, `WORKDIR`, `COPY`, and `CMD`
- Build images using `docker build` with a designated build context
- Inspect built images in the local Docker image store
- Distinguish between build-time operations (`RUN`) and container startup commands (`CMD`)

## The Build Pipeline: Dockerfile to Container

Running existing registry images handles standard tooling and infrastructure services. Shipping custom applications requires packaging application code, dependencies, and runtime configuration into a new image.

The container lifecycle follows three distinct stages:

| Component | Type | Responsibility |
| :--- | :--- | :--- |
| **Dockerfile** | Text source file | Declarative build instructions describing how to construct the filesystem and default execution command. |
| **Image** | Immutable artifact | Layered, packaged filesystem containing runtime dependencies and image metadata stored in the Docker engine cache. |
| **Container** | Runtime instance | Isolated Linux process execution running an image. |

The command pipeline connects them:

```text
Dockerfile  ──( docker build )──>  Image  ──( docker run )──>  Container
```

- `docker build` reads the Dockerfile, executes instructions against the build context, and writes a tagged image to the local store.
- `docker run` instantiates that image into an active or stopped container process.

## Writing a Minimal Dockerfile

Create a project directory with a simple payload file:

```bash
mkdir -p ~/my-image
cd ~/my-image
echo "hello from my image" > hello.txt
```

Create a file named `Dockerfile` (no file extension) in `~/my-image`:

```dockerfile
FROM alpine:3.20

WORKDIR /app

COPY hello.txt .

CMD ["cat", "hello.txt"]
```

### Core Instructions Breakdown

- **`FROM alpine:3.20`**: Specifies the starting parent image. Every Dockerfile begins with `FROM` to establish the base operating system and package environment.
- **`WORKDIR /app`**: Sets the working directory inside the container filesystem. Subsequent `COPY`, `RUN`, and `CMD` instructions execute relative to this path. If the directory does not exist, Docker creates it automatically.
- **`COPY hello.txt .`**: Copies `hello.txt` from the host build context into the container's current working directory (`/app`).
- **`CMD ["cat", "hello.txt"]`**: Sets the default command executed when the container starts. Here, `cat` reads `/app/hello.txt` and writes it to standard output.

## Building and Running the Image

Build the image from the project directory:

```bash
docker build -t my-first-image .
```

The command parameters specify:
- `-t my-first-image`: Tags the resulting image with the repository name `my-first-image`.
- `.`: Sets the **build context** to the current working directory.

Verify the image exists in the local image store:

```bash
docker image ls my-first-image
```

Run a container from the new image:

```bash
docker run --name hello my-first-image
```

The container starts, executes `cat hello.txt`, prints `hello from my image`, and exits cleanly. Inspect the completed container state:

```bash
docker ps -a --filter "name=hello"
docker logs hello
```

## Understanding the Build Context

The final argument in `docker build -t my-first-image .` specifies the build context:

```bash
docker build -t my-first-image .
                               ▲
                         build context
```

The build context is the directory tree sent to the Docker daemon or BuildKit engine at build time. 

- `COPY` and `ADD` instructions can only reference files and directories located inside this build context.
- Files located in parent directories (such as `../secrets.txt`) cannot be copied into the image because the builder only has access to the transferred context directory.
- Keeping the build context minimal improves build speed and prevents accidentally sending unnecessary files to the builder.

## Packaging Application Services

Real-world application images follow the same structure while adding dependency installation steps. Consider a Python web service:

```dockerfile
FROM python:3.12-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

CMD ["python", "app.py"]
```

### Build-Time (`RUN`) vs. Run-Time (`CMD`)

Understanding the distinction between `RUN` and `CMD` is fundamental to image authoring:

| Instruction | Execution Phase | Purpose | Example |
| :--- | :--- | :--- | :--- |
| **`RUN`** | Build time | Modifies the image filesystem during `docker build`. Installs packages, compiles binaries, or creates files. Cached as an immutable layer. | `RUN pip install -r requirements.txt` |
| **`CMD`** | Run time | Defines the default entry point and arguments executed when `docker run` starts the container. Does not modify image layers. | `CMD ["python", "app.py"]` |

## Key Takeaways

- A **Dockerfile** contains build instructions; `docker build` converts it into an **image**; `docker run` launches that image as a **container**.
- `FROM` sets the base image, `WORKDIR` sets the container working directory, `COPY` transfers files from the context, and `CMD` sets the default runtime command.
- The **build context** (the `.` argument) defines the boundary of files accessible to `COPY` during the build process.
- `RUN` executes during `docker build` to prepare dependencies and create image layers; `CMD` defines the process executed when a container starts.
