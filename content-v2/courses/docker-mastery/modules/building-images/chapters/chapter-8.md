# Chapter 8: Image Layers and Build Cache

## In this chapter, you will

- See that an image is constructed in layers
- Connect Dockerfile instructions to layers
- Understand when Docker reuses the build cache
- Learn why instruction ordering matters
- Apply the dependency-installation pattern

## Image Layers

Docker uses the instructions in a Dockerfile to construct the image **in layers**, and many instructions can participate in the **build cache**.

A useful mental model: each build step produces a layer, and Docker stacks those layers into the final image:

```
Layer 5:  COPY . .            (your source code)
Layer 4:  RUN npm install     (dependencies)
Layer 3:  COPY package*.json  (package files only)
Layer 2:  WORKDIR /app        (working directory)
Layer 1:  FROM node:20-alpine (base image)
```

The base image is itself a stack of layers that came from whoever built it. Your instructions add new layers on top.

## Instructions and Layers

Almost every instruction creates a layer:

- `COPY` and `ADD` create a layer containing the copied files.
- `RUN` creates a layer containing the result of the command — everything the command wrote to the filesystem.
- `WORKDIR` and metadata instructions contribute configuration, not usually files.
- `CMD` and `EXPOSE` are metadata; they do not add filesystem layers.

Because layers stack, an image is really a series of filesystem snapshots, each described by one instruction in your Dockerfile.

## Cache Reuse

When you change something, Docker rebuilds that step and everything after it. Steps whose inputs did not change are reused from the cache.

Consider this pattern:

```
COPY package*.json ./
RUN npm install

COPY . .
```

First build: everything runs. Now change `app.js` and rebuild:

```
app.js changes only?
        ↓
COPY . . runs again
RUN npm install is reused (cached)
```

The `npm install` step ran once and is now reused, because its inputs — the `package*.json` files — did not change.

## Cache Invalidation

Now change `package.json` and rebuild:

```
package.json changes?
        ↓
COPY package*.json reruns
RUN npm install runs again
COPY . . reruns
```

A changed input invalidates that step and **everything after it**. Everything below the change is untouched.

That is why the dependency install is separated from the application source. If you copied all your source *before* `npm install`, then every edit to `app.js` would force the dependency install to rerun.

## Why Instruction Ordering Matters

Put things that change rarely at the top and things that change often at the bottom, and most rebuilds are near-instant:

```
FROM node:20-alpine        # changes: rarely (only when you upgrade Node)
WORKDIR /app                # changes: never
COPY package*.json ./       # changes: when dependencies change
RUN npm install             # changes: when package.json changes
COPY . .                    # changes: on every code edit
```

When you edit code, only the bottom steps rebuild. The expensive dependency step is almost always served from cache.

## The Dependency-Installation Pattern

This ordering — dependency manifest, install, then source — is so common it has a name. It is the standard way to keep application builds fast:

```
COPY package*.json ./
RUN npm install
COPY . .
```

The manifest goes in first because it changes rarely; the install runs once and is cached; the source goes in last because it changes constantly. The same pattern applies to any language with a dependency manifest: `requirements.txt` for Python, `go.mod` for Go, `Gemfile` for Ruby.

> **Try This:** Rebuild an application image twice. First, touch only the source code and watch the dependency step report *cached*. Then change the dependency manifest and rebuild — the dependency step should run again. This is the fastest way to internalize how caching works.

## Key Takeaways

- Images are built as a **stack of layers**, one per instruction, on top of the base image.
- Unchanged steps are **reused from cache**; a changed step invalidates everything after it.
- Order instructions by change frequency: rarely-changing at the top, frequently-changing at the bottom.
- The **dependency-installation pattern** (manifest → install → source) keeps rebuilds fast.