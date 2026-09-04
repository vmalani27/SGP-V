# Chapter 9: Building an Application Image

## In this chapter, you will

- Structure a multi-file project with application code, dependencies, and a `.dockerignore` file
- Synthesize instructions from Chapters 5–8 into a production-grade Dockerfile
- Build, tag, and run a web service in detached mode with host port publishing (`-d`, `-p`)
- Verify running container health and HTTP traffic using `docker logs` and `curl`
- Observe the build cache in action when iterating on application code

## The Problem We Are Solving

Up to this point, our Dockerfiles have focused on isolated mechanics: creating single files, defining individual instructions, filtering contexts, and ordering layers. Real-world applications, however, are not isolated scripts. They depend on third-party packages, maintain local development caches, and run persistent background processes that must serve traffic to the outside world.

When developers attempt to containerize an application without connecting these pieces, three common failures occur: host artifacts like `node_modules/` pollute the build context and corrupt the Linux container; builds crawl because dependencies re-download on every single code change; and web servers start successfully inside the container but remain completely unreachable from the host machine's browser. In this chapter, you will assemble the lessons from Chapters 5–8 into a complete, repeatable containerization workflow.

## Concept & Project Layout

We will containerize a lightweight Node.js web service built with Express. The application listens on port `3000` and responds to HTTP requests with JSON.

Here is the directory structure for our project:

```text
express-app/
├── .dockerignore
├── Dockerfile
├── package.json
└── server.js
```

### `package.json`
The dependency manifest declares the application and requires `express`:

```json
{
  "name": "express-app",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

### `server.js`
A standard HTTP service that handles incoming requests on port `3000`:

```javascript
const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Hello from inside the container!' });
});

app.listen(PORT, () => {
  console.log(`Application listening on port ${PORT}`);
});
```

### `.dockerignore`
Applying the rule from Chapter 7, we exclude local dependencies and logs so they never transfer to the Docker daemon or overwrite packages built for the container's OS:

```text
node_modules
npm-debug.log
.git
.DS_Store
```

### `Dockerfile`
Now we combine the instruction set from Chapter 6 with the dependency-first caching order established in Chapter 8:

```dockerfile
# 1. Base runtime image with Node.js preinstalled
FROM node:20-alpine

# 2. Set an isolated working directory
WORKDIR /app

# 3. Copy only the dependency manifests first
COPY package*.json ./

# 4. Install dependencies (layer is cached unless package.json changes)
RUN npm install

# 5. Copy the rest of the application source code
COPY . .

# 6. Document that the container listens on port 3000
EXPOSE 3000

# 7. Default process to run when the container starts
CMD ["node", "server.js"]
```

## Hands-On Execution & Terminal Steps

### Step 1: Build and Tag the Image

Run `docker build` from inside the `express-app` directory. We pass `-t` (introduced in Chapter 5) to give the image a repository name and version tag:

```bash
docker build -t express-app:1.0 .
```

* **`-t express-app:1.0`**: Names the image `express-app` with tag `1.0`.
* **`.`**: Passes the current directory as the **build context**. Docker reads the `.dockerignore`, uploads the filtered directory to the daemon, and executes the Dockerfile.

**Expected Output:**
```text
[+] Building 3.8s (10/10) FINISHED
 => [internal] load build definition from Dockerfile                       0.0s
 => => transferring dockerfile: 284B                                       0.0s
 => [internal] load metadata for docker.io/library/node:20-alpine          0.9s
 => [internal] load .dockerignore                                          0.0s
 => => transferring context: 52B                                           0.0s
 => [1/4] FROM docker.io/library/node:20-alpine                           0.0s
 => [internal] load build context                                          0.0s
 => => transferring context: 1.1kB                                         0.0s
 => [2/4] WORKDIR /app                                                     0.1s
 => [3/4] COPY package*.json ./                                            0.0s
 => [4/4] RUN npm install                                                  2.4s
 => [5/4] COPY . .                                                         0.0s
 => exporting to image                                                     0.3s
 => => naming to docker.io/library/express-app:1.0                         0.0s
```

### Step 2: Run the Container with Port Publishing

In Chapter 6, you learned that `EXPOSE 3000` is documentation—it does not open network paths to the host. To reach the Express server from outside the container, you must publish the port using `-p`:

```bash
docker run -d -p 3000:3000 --name web-server express-app:1.0
```

* **`-d`** (*detached*): Runs the container in the background as a daemon process and returns your terminal prompt.
* **`-p 3000:3000`** (*publish*): Formatted as `-p <host-port>:<container-port>`. Forwards incoming traffic on host port `3000` into container port `3000`. Without this flag, traffic to `http://localhost:3000` would be rejected.
* **`--name web-server`**: Assigns an explicit name to the container so you can manage it without hunting for random IDs.
* **`express-app:1.0`**: Specifies the exact image and tag to run.

**Expected Output:**
```text
8f9e1c2a3b4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f
```

### Step 3: Verify the Running Container and Logs

Ensure the container is active and inspect the startup log:

```bash
docker ps
```

**Expected Output:**
```text
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                    NAMES
8f9e1c2a3b4d   express-app:1.0   "node server.js"         4 seconds ago   Up 3 seconds   0.0.0.0:3000->3000/tcp   web-server
```

Inspect the container logs to confirm Express started:

```bash
docker logs web-server
```

**Expected Output:**
```text
Application listening on port 3000
```

### Step 4: Test HTTP Connectivity

Send a GET request to the published port on your host machine:

```bash
curl -i http://localhost:3000
```

**Expected Output:**
```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 58
Date: Fri, 04 Sep 2026 12:00:00 GMT
Connection: keep-alive

{"status":"ok","message":"Hello from inside the container!"}
```

## The Learning Loop (Cause & Effect)

Now let's verify how the build cache accelerates real development workflows.

### Cause: Edit Code and Rebuild

1. Edit `server.js` to change the returned message:
   ```javascript
   // Change:
   res.json({ status: 'ok', message: 'Hello from inside the container!' });

   // To:
   res.json({ status: 'ok', message: 'Rebuilt in milliseconds with cached layers!' });
   ```

2. Rebuild the image with a new version tag:
   ```bash
   docker build -t express-app:1.1 .
   ```

### Effect: Instant Layer Cache Reuse

Watch the build output closely:

```text
 => [2/4] WORKDIR /app                                                     0.0s
 => [3/4] COPY package*.json ./                                            0.0s
 => CACHED [4/4] RUN npm install                                           0.0s
 => [5/4] COPY . .                                                         0.0s
 => exporting to image                                                     0.0s
 => => naming to docker.io/library/express-app:1.1                         0.0s
```

`RUN npm install` was not re-executed; Docker marked it `CACHED` and finished the build in less than half a second. Because `package*.json` was untouched, layer caching preserved the entire dependency installation.

### What Happens if the Order Was Inverted?

If the Dockerfile had used `COPY . .` *before* `RUN npm install`, modifying `server.js` would have invalidated the cache at the copy step. Docker would have been forced to re-run `npm install` and re-download all libraries on every single code change.

## Key Takeaways

- An application image coordinates four layers of responsibility: runtime environment (`FROM`), third-party dependencies (`RUN`), source code (`COPY`), and startup instructions (`CMD`).
- Always pair `COPY . .` with a `.dockerignore` file to prevent local development artifacts (`node_modules`) and sensitive configuration from leaking into the build.
- `EXPOSE` documents intent; you must use `docker run -p <host>:<container>` to route traffic across the container boundary.
- Structuring your Dockerfile with dependencies copied before source code ensures fast, cache-friendly rebuilds during active development.