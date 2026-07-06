# Lab 7: Container Networking

## What You're Doing and Why

In production, applications rarely run as a single container. A web application talks to a database. A backend talks to a cache. Containers that need to communicate with each other must be connected to the same network. This lab teaches you how Docker networking works and how to connect containers so they can find each other by name.

## Background

Docker creates a default bridge network for all containers. Containers on the default bridge can communicate by IP address but not by name. When you create a user-defined bridge network, Docker provides automatic DNS resolution so containers can reach each other using their container name as a hostname. This is the correct approach for any multi-container setup.

## Command Reference

### `docker network create <name>`

Creates a new user-defined bridge network.

### `docker network ls`

Lists all Docker networks.

### `docker run --network <name> --name <alias> <image>`

Starts a container connected to the specified network with the given name, which will also serve as its DNS hostname.

### `docker network inspect <name>`

Shows which containers are connected to a network and their assigned IP addresses.

## Scenario

Run a Flask application and a Redis container on the same user-defined network. The Flask application reads and writes a counter to Redis. Verify that the application can reach Redis using its container name as the hostname.

## Objective

Create a network, start two containers on it, and confirm that one container can reach the other by name. Access the Flask application from your browser and verify it increments the counter.

## Reflection

Open a shell inside the Flask container and run `ping redis`. Because both containers are on the same user-defined network, Redis resolves by name. Now remove the Flask container from the network using `docker network disconnect` and try again. Observe that name resolution fails immediately.
