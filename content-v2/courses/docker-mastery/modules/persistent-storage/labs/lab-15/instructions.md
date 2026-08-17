# Lab 15: Production Storage Patterns

## What You're Doing and Why

This lab brings together everything from the previous nine labs into a single end-to-end workflow. You receive an application that is not yet containerized and take it from source code to a running, production-ready container image with persistent data, correct networking, and a published image.

## Scenario

A todo list API has been provided. It is a Python Flask application that stores data in a PostgreSQL database. Neither a Dockerfile nor any container configuration exists yet. Your job is to containerize it completely.

## Objective

Write a Dockerfile for the Flask API using a multi-stage build. Create a named volume for the PostgreSQL data. Create a user-defined network and run both containers on it. Verify the API can connect to the database by creating and retrieving a todo item. Tag the API image and push it to your registry. Document the exact commands needed to reproduce this setup from scratch so that a colleague could run the application on their machine with no prior knowledge of its implementation.

## Reflection

Notice how much manual work you are doing to connect these pieces. You created the network, started the database, waited for it to be ready, started the application, and ensured the containers could find each other. In a real development team, this setup needs to be automated and reproducible for every developer. The natural next step, which you will explore in the Docker Compose module, is to describe this entire configuration in a single file and launch it with one command.
