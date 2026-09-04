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

The starter application is already prepared in your lab environment at `~/express-app`:

```text
express-app/
├── .dockerignore
├── Dockerfile
├── package.json
└── server.js
```

### `package.json`
The dependency manifest declares our dependency on Express:

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

Let's build and run the application. Notice:
- `EXPOSE 3000` documents the port, but `-p 3000:3000` is what maps incoming host traffic to the container port.
- `-d` runs the container in detached mode so your terminal stays free.

Try it — click **Run this next**, review the command, then press Enter:

:::terminal-demo
id: building-application-image
image: labops-docker-build:latest
pre_pull:
  - node:20-alpine
state:
  label: web-server
  command: docker inspect -f '{{.State.Status}}' web-server 2>/dev/null || echo "not running"
steps:
  - id: inspect-project
    label: Enter the project directory and inspect files
    run: cd ~/express-app && ls -la
    expect: |
      `Dockerfile`, `package.json`, `server.js`, and `.dockerignore` are present.
  - id: inspect-dockerfile
    label: View the Dockerfile
    run: cat Dockerfile
    expect: |
      Notice the layer sequence: runtime base, working directory, package manifest,
      npm install, application source copy, exposed port, and startup CMD.
  - id: build-image
    label: Build and tag the image
    run: docker build -t express-app:1.0 .
    expect: |
      Docker loads the build context, downloads dependencies into a layer via
      `RUN npm install`, and tags the image as `express-app:1.0`.
  - id: run-container
    label: Run in detached mode with port publishing
    run: docker run -d -p 3000:3000 --name web-server express-app:1.0
    expect: |
      A container ID is printed, and the state chip flips to `running`. Port 3000
      is mapped from your host into the container.
  - id: verify-ps
    label: Confirm the container is running
    run: docker ps
    expect: |
      A row for `web-server` appears showing image `express-app:1.0` and status `Up`.
  - id: verify-logs
    label: Inspect application logs
    run: docker logs web-server
    expect: |
      `Application listening on port 3000` is printed by the Express process.
  - id: test-http
    label: Send an HTTP request to the published port
    run: curl -i http://localhost:3000
    expect: |
      HTTP/1.1 200 OK with `{"status":"ok","message":"Hello from inside the container!"}`.
examples:
  - docker inspect web-server --format '{{json .NetworkSettings.Ports}}'
  - docker top web-server
:::

## The Learning Loop (Cause & Effect)

Now verify the real-world performance payoff of copying `package*.json` before application code. When you change `server.js`, Docker skips the expensive `npm install` layer and pulls it straight from cache.

Run the experiment in the live terminal below:

:::terminal-demo
id: building-application-image
image: labops-docker-build:latest
pre_pull:
  - node:20-alpine
steps:
  - id: edit-code
    label: Modify the application response message
    run: sed -i 's/Hello from inside the container!/Rebuilt in milliseconds with cached layers!/' server.js
    expect: |
      `server.js` is updated. `package.json` remains completely untouched.
  - id: rebuild-cached
    label: Rebuild the image
    run: docker build -t express-app:1.1 .
    expect: |
      Look for `CACHED RUN npm install`. Because dependencies did not change,
      Docker reuses the cached layer and the rebuild completes in under a second.
  - id: compare-history
    label: Compare image layer history
    run: docker history express-app:1.1
    expect: |
      Earlier layers match `express-app:1.0`; only the top layers changed.
:::

## Key Takeaways

- An application image coordinates four layers of responsibility: runtime environment (`FROM`), third-party dependencies (`RUN`), source code (`COPY`), and startup instructions (`CMD`).
- Always pair `COPY . .` with a `.dockerignore` file to prevent local development artifacts (`node_modules`) and sensitive configuration from leaking into the build.
- `EXPOSE` documents intent; you must use `docker run -p <host>:<container>` to route traffic across the container boundary.
- Structuring your Dockerfile with dependencies copied before source code ensures fast, cache-friendly rebuilds during active development.