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

Try it — write a file, stop and start the *same* container, then run a *fresh* container from the same image. Watch what survives and what does not:

:::terminal-demo
id: container-data
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
state:
  label: data-test
  command: docker inspect -f '{{.State.Status}}' data-test 2>/dev/null || echo "not created"
steps:
  - id: create-data-test
    label: Start a container to experiment on
    run: docker run -d --name data-test alpine sleep 300
    expect: |
      A container ID is printed and the state chip flips to `running` —
      `data-test` is up and waiting in the background.
  - id: write-writable-layer
    label: Write a file into the writable layer
    run: docker exec data-test sh -c 'echo here > /tmp/note.txt'
    expect: |
      Nothing is printed — the file is written into the container's private
      writable layer.
  - id: confirm-written
    label: Confirm the file exists
    run: docker exec data-test cat /tmp/note.txt
    expect: |
      `here` — the writable layer holds the file.
  - id: stop-data-test
    label: Stop the same container
    run: docker stop data-test
    expect: |
      `data-test` is echoed and the state chip flips to `exited`. The writable
      layer is untouched by stopping.
  - id: start-data-test
    label: Start the same container again
    run: docker start data-test
    expect: |
      `data-test` is echoed and the chip returns to `running`.
  - id: check-data-survived
    label: Check the file survived the stop/start
    run: docker exec data-test cat /tmp/note.txt
    expect: |
      `here` is still printed — *same container + stop/start → data survives*.
  - id: remove-data-test
    label: Remove the container
    run: docker rm -f data-test
    expect: |
      `data-test` is echoed and the chip reads `not created` — the writable
      layer, and the file in it, are gone.
  - id: fresh-container-empty
    label: Run a fresh container from the same image
    run: docker run --rm --name data-fresh alpine ls /tmp
    expect: |
      The `/tmp` listing is empty — a *new container from the same image →
      data does not survive*. The image itself was never touched.
:::

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

Try it — create a volume, write into it from one container, destroy that container, and read the data back from a brand-new one:

:::terminal-demo
id: container-data
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: create-volume
    label: Create a volume
    run: docker volume create my-data
    expect: |
      The volume name `my-data` is printed — Docker now manages this storage
      area independently of any container.
  - id: list-volumes
    label: List the volume
    run: docker volume ls
    expect: |
      A table showing `my-data` in the `VOLUME NAME` column.
  - id: mount-write
    label: Mount it into a container and write
    run: docker run -d --name vol-writer -v my-data:/data alpine sleep 300
    expect: |
      A container ID is printed. `/data` inside `vol-writer` is backed by the
      `my-data` volume.
  - id: persist-file
    label: Write a file into the volume
    run: docker exec vol-writer sh -c 'echo survive > /data/note.txt'
    expect: |
      Nothing is printed — the file lands in the volume, not the writable layer.
  - id: destroy-writer
    label: Destroy the container
    run: docker rm -f vol-writer
    expect: |
      `vol-writer` is echoed. The container is gone, but the volume (and its
      data) remain.
  - id: read-back
    label: Read the data from a brand-new container
    run: docker run --rm -v my-data:/data alpine cat /data/note.txt
    expect: |
      `survive` — the volume outlived the container. Mount it into any new
      container and the data is back.
  - id: remove-volume
    label: Clean up the volume
    run: docker volume rm my-data
    expect: |
      `my-data` is echoed — the volume, and the data inside it, are gone.
examples:
  - docker volume inspect my-data
  - docker inspect vol-writer --format '{{json .Mounts}}'
:::

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

Try it — mount a directory from your machine into a container, write to it from inside the container, then read back `docker inspect`'s `Mounts` section:

:::terminal-demo
id: container-data
image: sgp-lab-docker:latest
pre_pull:
  - alpine:latest
steps:
  - id: make-shared
    label: Create a directory to share
    run: mkdir -p ~/shared
    expect: |
      Nothing is printed — `~/shared` now exists on your filesystem.
  - id: seed-host-file
    label: Drop a file into it from your side
    run: echo "from-host" > ~/shared/message.txt
    expect: |
      Nothing is printed — `message.txt` lives on your filesystem.
  - id: read-in-container
    label: Mount it as a bind mount
    run: docker run --rm -v ~/shared:/data alpine cat /data/message.txt
    expect: |
      `from-host` — the bind mount exposes your directory at `/data` inside the
      container. The container reads the file that lives on your machine.
  - id: write-from-container
    label: Write into it from the container
    run: docker run --rm -v ~/shared:/data alpine sh -c 'echo from-container > /data/note.txt'
    expect: |
      Nothing is printed — the write goes through the mount.
  - id: check-on-host
    label: See the file from your side
    run: cat ~/shared/note.txt
    expect: |
      `from-container` — the container's write appeared on your filesystem.
      Both sides see the same directory.
  - id: run-mount-demo
    label: Start a container to inspect
    run: docker run -d --name mount-demo -v ~/shared:/data alpine sleep 300
    expect: |
      A container ID is printed — `mount-demo` stays up so you can inspect it.
  - id: inspect-mounts
    label: Read the Mounts section
    run: docker inspect mount-demo | grep -A9 'Mounts'
    expect: |
      A `"Mounts"` entry whose `"Type"` is `bind`, whose `"Source"` points at
      your `~/shared` directory, whose `"Destination"` is `/data`, and whose
      `"RW"` is `true`.
  - id: clean-mount-demo
    label: Clean up
    run: docker rm -f mount-demo
    expect: |
      `mount-demo` is echoed — the container is gone.
examples:
  - docker run --rm -v ~/shared:/data alpine ls -la /data
  - docker volume create tmp-vol && docker rm -f $(docker ps -aq) 2>/dev/null; true
  - docker inspect data-fresh --format '{{json .Mounts}}'
:::

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
