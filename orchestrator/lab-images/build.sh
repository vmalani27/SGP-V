#!/bin/bash
set -e

REGISTRY="${ECR_REGISTRY:-public.ecr.aws/i9t1l0m7/vmalani27}"
TAG="${1:-dev}"
DOCKER_CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG_DIR"' EXIT

ECR_PASSWORD="$(aws ecr-public get-login-password --region us-east-1)"
ECR_AUTH="$(printf 'AWS:%s' "$ECR_PASSWORD" | base64 | tr -d '\r\n')"
printf '{"auths":{"public.ecr.aws":{"auth":"%s"}}}\n' "$ECR_AUTH" > "$DOCKER_CONFIG_DIR/config.json"
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"

build_and_push() {
	local local_tag="$1"
	local remote_tag="$2"
	local dockerfile="$3"

	docker build \
		-t "$local_tag" \
		-t "$REGISTRY/$remote_tag" \
		-f "$dockerfile" \
		.
	docker push "$REGISTRY/$remote_tag"
}

echo "Pulling and saving preloads..."
docker pull alpine:latest
docker save alpine:latest -o preloads/alpine.tar
docker pull nginx:alpine
docker save nginx:alpine -o preloads/nginx.tar
echo "Building base ubuntu..."
build_and_push "labops-ubuntu:latest" "labops-base:$TAG" "Dockerfile.ubuntu"
echo "Building docker base..."
build_and_push "labops-docker:latest" "labops-labs:docker-$TAG" "Dockerfile.docker"
echo "Building docker fundamentals..."
build_and_push "labops-docker-fundamentals:latest" "labops-labs:docker-fundamentals-$TAG" "Dockerfile.docker-fundamentals"
echo "Building docker build..."
build_and_push "labops-docker-build:latest" "labops-labs:docker-build-$TAG" "Dockerfile.docker-build"
echo "Building git fundamentals..."
build_and_push "labops-git-fundamentals:latest" "labops-labs:git-fundamentals-$TAG" "Dockerfile.git-fundamentals"
