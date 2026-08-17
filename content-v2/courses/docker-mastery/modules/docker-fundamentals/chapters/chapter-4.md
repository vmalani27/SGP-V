# Chapter 4: Container Data

## In this chapter, you will

- Understand the writable layer containers write to
- See the difference between stopping, removing, and recreating a container
- Prove that writing inside a container never changes its image
- Persist data across container removal with volumes
- Mount a directory from your machine into a container with bind mounts
- Inspect the `Mounts` section to see where a container's data comes from

## The Writable Layer

An image is read-only. When Docker creates a container from an image, it places a thin **writable layer** on top of the image's layers. Reads come from the image; writes land in the writable layer.

Every container has its own writable layer, private to that container. Ten containers from the same image share the image's layers, but each writes into its own private layer — containers never see each other's changes.

## Stop vs. Remove vs. Recreate

Three operations, three very different consequences for your data:

- **`docker stop`** pauses the container. The writable layer stays intact, so anything you wrote is still there when you `docker start` it again.
- **`docker rm`** deletes the container — and with it, its writable layer and everything in it.
- **`docker run` again from the same image** creates a *new* container with a *fresh* writable layer. It does not contain anything you wrote before.

The distinction is the core idea of this chapter:

```
same container + stop/start        → data survives
new container from same image      → data does not survive
```

Containers are ephemeral by design. They are meant to be disposable — but that only works if you know where your data actually lives.

## Writing in a Container Never Changes the Image

It is easy to assume that editing a file inside a container changes the image it came from. It does not. Writes go to the container's private writable layer; the image's layers on disk stay untouched. If you create a fresh container from the same image, it is exactly as the image specifies — none of your container's changes are there.

## Persistent Storage: Volumes

Anything that must outlive a container cannot live inside it. The answer is a **volume**: a storage area managed by Docker that exists independently of any container.

```
docker volume create my-data
docker volume ls
docker volume inspect my-data
```

Mount a volume into a container at run time:

```
docker run -v my-data:/data alpine
```

Everything written to `/data` inside the container is actually stored in the volume. Remove the container and the volume (and its data) remain; run a new container with the same volume mounted and the data is back:

```
container A → volume → container B
A is gone, data remains.
```

A volume has a **lifecycle independent of containers**: `docker rm` never removes the volumes a container used. Only `docker volume rm` deletes a volume — and with it, everything stored inside it.

## Bind Mounts

A **bind mount** mounts a directory from your machine into a container at a specific path. The difference from a volume is who manages the location:

```
Volume       → Docker manages where the storage lives
Bind mount   → you provide the filesystem path
```

```
docker run -v /home/you/shared:/data alpine
```

Files the container writes to `/data` appear in `/home/you/shared` on your machine, and they survive container removal just like volumes do.

## Inspecting Where Data Comes From

`docker inspect <container>` reports every mount in the `Mounts` section. Each entry tells you:

| Field | What it shows |
|-------|---------------|
| `Type` | `volume` (Docker-managed) or `bind` (a path you provided) |
| `Source` | Where the storage actually lives |
| `Destination` | The path it is mounted at inside the container |
| `RW` | Whether the container can read and write to it |

This is how you answer the questions that matter: *where is this container's data coming from, is it in the writable layer or in mounted storage, and what happens to it if I remove the container?*

> **Try This:** Create a file inside a container:
>
> ```
> docker run --name file-test alpine:latest touch /tmp/hello.txt
> ```
>
> The container creates `/tmp/hello.txt`, then exits. Remove it and run a fresh one from the same image:
>
> ```
> docker rm file-test
> docker run --name file-test alpine:latest ls /tmp
> ```
>
> The directory is empty — the file vanished with the container. The image itself was untouched: that is the ephemerality of the writable layer.

## Key Takeaways

- A container writes to a writable layer that is private to it
- Stopping a container preserves its data; removing it destroys the writable layer; a new container from the same image starts fresh
- Container writes never modify the image
- **Volumes** are Docker-managed storage that outlive containers; `docker volume rm` deletes them
- **Bind mounts** mount a directory you provide; you manage the location
- `docker inspect` → `Mounts` shows `Type`, `Source`, `Destination`, and `RW` for every mount
