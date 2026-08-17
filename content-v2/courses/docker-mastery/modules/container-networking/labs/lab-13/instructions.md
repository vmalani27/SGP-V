# Lab 13: Composing Multi-Container Apps

## What You're Doing and Why

A compiled application needs a build environment with compilers, headers, and build tools. But none of those tools are needed at runtime. Shipping a production image that includes a full compiler toolchain wastes disk space and increases the attack surface. Multi-stage builds let you use a heavy build environment to compile the application and then copy only the compiled artifacts into a minimal runtime image.

## Background

A multi-stage Dockerfile uses multiple `FROM` instructions, each starting a new stage. You can name stages with `AS` and then reference them in later `COPY` instructions using `--from=stagename`. Docker builds every stage but only includes the final stage in the output image. Intermediate stages are used during the build and then discarded. The result is a production image that contains only what is needed to run the application.

## Command Reference

### `FROM <image> AS builder`

Starts a named build stage. Later stages can copy from this stage using `--from=builder`.

### `COPY --from=builder /path/in/builder /path/in/final`

Copies a file from a previous stage into the current stage.

## Scenario

A Go application has been provided. Write a multi-stage Dockerfile that compiles the application in a `golang` image and copies only the compiled binary into a minimal `alpine` or `scratch` image. Compare the sizes of the single-stage and multi-stage images.

## Objective

Build two images: one using a single stage and one using a multi-stage build. Run `docker images` and compare their sizes. Verify that both images run the application correctly.

## Reflection

A single-stage Go image built on `golang:1.21` is typically over 800 megabytes. A multi-stage build that copies only the compiled binary into a `scratch` image is typically under 10 megabytes. That is a reduction of more than 98 percent. In a production environment with hundreds of deployments per day, that difference in image size has a meaningful impact on pull times, registry storage costs, and container startup speed.
