#!/bin/bash
set -e
echo "Pulling and saving preloads..."
docker pull alpine:latest
docker save alpine:latest -o preloads/alpine.tar
docker pull nginx:alpine
docker save nginx:alpine -o preloads/nginx.tar
echo "Building base ubuntu..."
docker build -t labops-ubuntu:latest -f Dockerfile.ubuntu .
echo "Building docker base..."
docker build -t labops-docker:latest -f Dockerfile.docker .
echo "Building docker fundamentals..."
docker build -t labops-docker-fundamentals:latest -f Dockerfile.docker-fundamentals .
echo "Building docker build..."
docker build -t labops-docker-build:latest -f Dockerfile.docker-build .
echo "Building git fundamentals..."
docker build -t labops-git-fundamentals:latest -f Dockerfile.git-fundamentals .
