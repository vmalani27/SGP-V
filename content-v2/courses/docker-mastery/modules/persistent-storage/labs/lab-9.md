# Lab 9: Publishing Images to a Registry

## What You're Doing and Why

An image that exists only on your machine is useful only to you. Publishing it to a registry makes it available to teammates, deployment pipelines, and production servers. This lab teaches you to tag images correctly and push them to Docker Hub, the default public registry.

## Background

An image tag follows the format `username/repository:tag`. If you omit the tag, Docker defaults to `latest`, but relying on `latest` in production is a common antipattern because it makes deployments non-deterministic. Best practice is to tag images with a specific version, the Git commit hash, or the build number from your CI pipeline. Multiple tags can point to the same image. Tagging an image does not copy it; it just creates a new pointer.

## Command Reference

### `docker login`

Authenticates with Docker Hub using your account credentials.

### `docker tag <image> <username>/<repo>:<tag>`

Creates a new tag for an existing image.

### `docker push <username>/<repo>:<tag>`

Uploads the image to the registry.

### `docker pull <username>/<repo>:<tag>`

Downloads the image from the registry.

## Scenario

You have built the Flask application image from Lab 5. Tag it with a version number and push it to your Docker Hub account. Simulate a deployment by removing the local image and pulling it back from the registry.

## Objective

Tag the image with version `1.0.0` and push it. Remove the local image using `docker image rm`. Pull it back from Docker Hub. Run a container from the pulled image and verify it works.

## Reflection

Every image you push is public by default on Docker Hub. For private images, Docker Hub offers private repositories on paid plans, and alternatives like GitHub Container Registry, AWS ECR, and Google Artifact Registry provide private registries with tighter integration into their respective ecosystems.
