# Chapter 9: Building an Application Image

## In this chapter, you will

- Bring the earlier lessons together on a real application
- Choose a base runtime image
- Lay out the source, dependency files, and startup command
- Build and run the resulting image

## What a Real Application Image Needs

Now you have everything needed to read a full example without being handed a mystery. A real application image has a few standard pieces:

- **Application source** — your code
- **Dependency files** — the manifest that describes your libraries
- **Base runtime image** — an image that already has your language runtime
- **Install dependencies** — during the build, so they are frozen into the image
- **Copy source** — after dependencies, so the cache survives code edits
- **Expose the application port** — document where the app listens
- **Startup command** — what runs when the container starts

## A Small Application, Not a Large One

Keep the example small. A tiny app is enough to show the full pattern; a large production application only adds noise.

Here is a minimal Node.js application. First, the project files:

```
package.json
server.js
```

`package.json` declares the app and its dependencies:

```json
{
  "name": "hello-app",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.19.0" }
}
```

`server.js` starts a small HTTP server:

```js
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Hello from Docker!'));

app.listen(3000, () => console.log('listening on 3000'));
```

## The Dockerfile

Now the Dockerfile in the project root:

```
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

Piece by piece:

- `FROM node:20-alpine` starts from a base runtime image that already has Node.js.
- `WORKDIR /app` makes `/app` the working directory for everything after it.
- `COPY package*.json ./` copies just the dependency manifest, and `RUN npm install` installs dependencies during the build — the layer-cache pattern from the last lesson.
- `COPY . .` copies the rest of your application.
- `EXPOSE 3000` documents the port, and `CMD` starts the server.

## Build and Run

With this Dockerfile in your project root, build and run it:

```
docker build -t my-app .
docker run -d -p 3000:3000 my-app
```

Your application is now running in a container built from your own image. Visit `http://localhost:3000` to see it.

## The Order Is Not Accidental

The instruction order is the layer-cache story in practice: base image, working directory, dependency manifest, dependencies, source, port, startup command. Edit `server.js` and rebuild — `RUN npm install` is reported as *cached*, because nothing about the dependencies changed.

> **Try This:** Create the tiny application above (or a Python equivalent with `requirements.txt` and a small Flask app), write the Dockerfile, and build and run it. Then touch `server.js` and rebuild — note how `RUN npm install` is reported as *cached*, because nothing about the dependencies changed.

## Key Takeaways

- A real application image has a standard set of pieces: source, dependency files, base runtime image, installed dependencies, exposed port, and a startup command.
- Build the smallest application that shows the pattern — a tiny app teaches everything a large one does, with less to distract you.
- The dependency-manifest-first ordering keeps rebuilds fast.
- Build with `docker build -t name .` and run with `docker run -p 3000:3000 name`.