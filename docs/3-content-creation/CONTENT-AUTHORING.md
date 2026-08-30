# Content and Lab Authoring Guide

This guide explains how to write course content and labs in a way that is consistent with the SGP content model and the learning flow in this repository.

## 1. Core principle

Every course should feel like a progression of skills, not a list of disconnected topics.

Use this rule:

- chapter = concept
- lab = proof of skill
- module = a coherent capability
- course = a progression of capabilities

A lesson is not valuable if it only asks the learner to memorize a fact. A good lesson makes the learner do something, inspect the result, and explain what changed.

---

## 2. Course structure

A course is defined in `content-v2/courses/{course-id}/course.yaml`.

Example:

```yaml
id: docker-mastery
title: Docker Mastery
description: Containers, multi-stage builds, Docker Compose, and production-ready deployments.
level: intermediate
modules:
  - docker-fundamentals
  - building-images
  - container-networking
  - persistent-storage
```

A course should be ordered by increasing complexity:

1. fundamentals and mental models
2. building and debugging images
3. networking and service communication
4. persistence and data lifecycles
5. Compose / multi-container apps
6. hardening and production readiness

Do not put a later topic before the learner has the required mental model.

---

## 3. Module structure

Each module lives under:

```text
content-v2/courses/{course-id}/modules/{module-id}/
```

and is defined by `module.yaml`.

Example:

```yaml
id: docker-fundamentals
title: Docker Fundamentals
description: Master the container CLI — from your first container to inspecting, configuring, and cleaning up after them.
order: 1
items:
  - type: chapter
    id: chapter-1
  - type: lab
    id: lab-1
  - type: chapter
    id: chapter-2
  - type: lab
    id: lab-2
```

### Module rules

- one module = one skill area
- a module should feel complete in itself
- labs should be numbered locally within the module
- do not spread a topic across multiple modules unless the topic itself is conceptually different
- keep each module narrow enough that a learner can tell what they learned by the end

Good module boundaries:

- Docker Fundamentals
- Building Custom Images
- Container Networking
- Persistent Storage
- Docker Compose
- Production Readiness

Avoid a module that mixes image building, networking, storage, and orchestration in one place.

---

## 4. Chapter writing

A chapter is the explanation layer. It should answer a single conceptual question.

Good chapter topics:

- what is a container versus an image
- why Dockerfile order matters
- how bridge networks work
- why volumes outlive containers
- what entrypoint and cmd do

### Chapter rules

- explain the concept in plain language
- include one mental model or diagram if helpful
- include a few command examples
- avoid long walls of theory
- end with a short “try this” section or a small hands-on prompt

A chapter should not be a summary of everything in the lab. It should prepare the learner for the next lab.

### Good chapter pattern

1. state the problem
2. explain the concept
3. show the commands
4. show what to observe
5. connect the concept back to the next lab

---

## 5. Lab writing

A lab is where the learner proves they can do the thing.

The lab file is `content-v2/courses/{course-id}/modules/{module-id}/labs/{lab-id}/lab.yaml` and the instructions are in `instructions.md`.

### The lab should produce a real result

A lab should ask the learner to:

- create a file or directory
- build an image
- run a container
- inspect runtime state
- fix a broken configuration
- verify a state change

The strongest lab tasks are observable through shell commands and runtime state.

### Bad lab pattern

- “What is a Dockerfile?”
- “What does a volume do?”
- “Explain the difference between image and container?”

These are fine as quick concept checks, but they are not the strongest lab tasks. They test recall rather than skill.

### Good lab pattern

- create a real artifact
- change a real config
- observe Docker behavior
- fix a problem
- verify by command output

Example lab flow:

1. create a project directory
2. write a Dockerfile or config
3. build the image
4. run the container
5. inspect logs or config
6. fix the bug
7. rebuild and verify success

---

## 6. Task design principles

Every task in a lab should answer one question and produce one observable result.

### Task types

Use the right task type for what the learner is proving:

- `terminal_action` — the student runs commands and produces output
- `multiple_choice` — the learner chooses the correct explanation or outcome
- `file_check` — the student creates or edits a file and the validator checks it
- `port_check` — the learner exposes something and the validator confirms it is reachable

### Good task characteristics

- short and concrete
- test real behavior, not memorization
- require evidence in the form of output or file state
- have a clear failure signal
- use `command` validation whenever the task can be checked in a container

### Bad task characteristics

- abstract questions with no direct evidence
- multiple concepts mixed into one task
- prompts that tell the learner exactly what command to type
- validation that only checks for a string in a markdown file instead of runtime behavior

---

## 7. Validation design

Validation should prove that the learner actually did the work.

Prefer this pattern:

```yaml
validation:
  command: "docker run --rm cache-demo 2>/dev/null | grep -qx 'app v2'"
  match_type: exact
  expected_output: "app v2"
```

This is stronger than asking a plain question, because the student must produce a container state and the output must match.

### Good validation patterns

- check a file exists and contains a value
- run a Docker command and verify output
- check the running state of a container
- confirm a file was created in the right place
- confirm a port is listening or a container is connected on a network

### Avoid weak validation

- “How many bytes was the image?” with no actual image inspection
- questions that can be answered from memory without running Docker
- tasks that do not produce a visible state change

---

## 8. Progression model for a course

The best courses teach in layers:

### Layer 1: environment model
The learner understands containers as isolated execution environments.

### Layer 2: image creation
The learner can build and debug a Dockerfile.

### Layer 3: connectivity
The learner can connect containers to each other and to the host.

### Layer 4: persistence
The learner understands why data needs volumes or bind mounts.

### Layer 5: app composition
The learner can run a multi-container application with Compose.

### Layer 6: production readiness
The learner understands hardening, healthchecks, observability, and image hygiene.

A course should not jump from layer 1 to layer 6. Each lab should expand the learner's mental model gradually.

---

## 9. Writing guidelines for content authors

When writing a new module, follow this checklist:

### Module checklist

- Does the module have one clear skill outcome?
- Are the chapters ordered from concept to application?
- Are the labs ordered from construction to debugging?
- Does the module end with a synthesis challenge?
- Are the IDs unique and stable?
- Does the course sequence build logically?

### Lab checklist

- Can the learner finish it in 10–25 minutes?
- Does the lab require a real Docker action?
- Does the lab have observable validation?
- Does it test behavior, not recall?
- Are there hints instead of full answers?
- Is the task outcome something the learner can explain later?

### Content checklist

- text is practical and specific
- examples are short and copy-pastable
- commands are realistic
- errors are described at the level the learner will see them
- each topic connects to the next one

---

## 10. Example of a strong lab

This is the pattern to aim for:

```yaml
id: lab-8
title: Image Layers and Build Cache
difficulty: intermediate
environment: docker-build

tasks:
  - id: create-project
    prompt: Create a small project with a dependency file and app script.
    type: terminal_action
    validation:
      command: test -f ~/cache-demo/deps.txt && echo PROJECT_OK
      match_type: exact
      expected_output: PROJECT_OK

  - id: build-first
    prompt: Build the image and run it.
    type: terminal_action
    validation:
      command: docker run --rm cache-demo 2>/dev/null | grep -qx 'app v1'
      match_type: exact
      expected_output: app v1

  - id: modify-source
    prompt: Change the app, rebuild, and watch the cache behavior.
    type: terminal_action
    validation:
      command: docker run --rm cache-demo 2>/dev/null | grep -qx 'app v2'
      match_type: exact
      expected_output: app v2
```

This lab does not ask a trivia question. It makes the learner:

- build an image
- observe layer reuse
- understand cache invalidation
- explain why the order of instructions matters

That is exactly the kind of activity this content system is designed to support.

---

## 11. When to add a new module instead of a new lab

Add a new module when the skill clearly changes.

Examples:

- from running containers to building images
- from local containers to networking
- from networking to persistence
- from single services to multi-container apps

Add a new lab when the skill remains in the same domain but needs a more specific practice exercise.

---

## 12. Final rule

If a learner can explain the concept and also prove it with a command, the content is good.

If a learner can only repeat a definition, it is not yet strong lab content.

That is the standard to aim for in this project.
