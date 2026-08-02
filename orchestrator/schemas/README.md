# lab.yaml — Course Author Guide

This directory contains the schema and reference files for writing course `lab.yaml` definitions.

## Files

| File | Purpose |
|------|---------|
| `lab-schema.json` | JSON Schema for validating `lab.yaml` files |
| `lab-sample.yaml` | Complete working examples (both flat and monolithic formats) |

## How the Lab Schema Works

```
Course Author                    Backend                         Orchestrator
─────────────                    ───────                         ────────────
Writes lab.yaml
  ↓
Validates against lab-schema.json
  ↓
Publishes course
                                 Reads lab.yaml
                                 Resolves environment (from ref or inline)
                                 Starts lab ─────────────────→   docker run {image}
                                                                    ↓
                                 Sends setup commands ───────→     docker exec (setup)
                                                                    ↓
                                 Shows task prompt
                                 Student types in terminal
                                 Clicks "Check"
                                 Sends validation cmd ─────→     docker exec (validate)
                                                                 returns output
                                 Compares to expected_output
                                 Unlocks next task
```

**Key rule: The orchestrator never reads lab.yaml.** The backend reads it and sends the environment config. The frontend reads it for task prompts and validation rules. The orchestrator just runs containers and execs commands.

## Two Supported Formats

### Format A: Flat (New — One lab per file)

Each lab gets its own directory with `lab.yaml` and `instructions.md`. Environment config is shared — referenced by name from `environments/{name}.yaml`.

```
content-v2/
  courses/{course-id}/
    course.yaml
    modules/{module-id}/
      module.yaml
      chapters/
        chapter-1.md
      labs/{lab-id}/
        lab.yaml          ← One lab, its tasks, and an environment reference
        instructions.md   ← Markdown content shown to the student
  environments/
    docker-basic.yaml     ← Shared environment def, referenced by labs
```

```yaml
id: hello-world
title: Hello World Container
environment: docker-basic
tasks:
  - id: count-images
    prompt: "How many images are available?"
    type: multiple_choice
    options_source: dynamic
    validation:
      command: "docker images -q | wc -l | tr -d ' '"
      match_type: exact
```

### Format B: Monolithic (Old — All labs in one file)

Single `lab-N.yaml` contains environment + all phases + all labs + all tasks. Used for backward compatibility.

```yaml
environment:
  base_image: "sgp-lab-docker:latest"
phases:
  - id: "phase-0"
    type: "setup"
    steps:
      - command: "apt-get install -y docker.io"
  - id: "phase-1"
    labs:
      - id: "lab-1"
        tasks:
          - id: "task-1"
            prompt: "How many images?"
            type: multiple_choice
            validation: { command: "...", match_type: "exact" }
```

## Writing a lab.yaml — Flat Format

### 1. Metadata Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | yes | string | Lab identifier. Matches directory name. |
| `title` | yes | string | Human-readable lab title. |
| `difficulty` | no | enum | `beginner`, `intermediate`, or `advanced` |
| `estimated_time` | no | integer | Minutes to complete. |
| `xp` | no | integer | Experience points. |
| `tags` | no | string[] | Topic tags for filtering. |
| `objectives` | no | string[] | Learning objectives. |
| `environment` | yes | string | Reference to an environment file (e.g. `"docker-basic"` → `environments/docker-basic.yaml`) |
| `setup` | no | object[] | Commands to reset state before the lab starts. |
| `tasks` | yes | object[] | Ordered list of tasks (minimum 1). |
| `completion` | no | object | Completion rules (`required_tasks: all` or a list of task IDs). |

### 2. Environment Reference

Environment files live in `content-v2/environments/`:

```yaml
# environments/docker-basic.yaml
base_image: "sgp-lab-docker:latest"
pre_pull:
  - nginx:alpine
  - alpine:latest
```

Available base images (build from `orchestrator/lab-images/`):

| Image | What's included |
|-------|----------------|
| `sgp-lab-ubuntu:latest` | Ubuntu 22.04 + systemd + student user + sudo |
| `sgp-lab-docker:latest` | Same + Docker daemon (for DinD courses) |
| `sgp-lab-git:latest` | Same + git pre-installed |

### 3. Tasks

Each task has:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique within the lab. |
| `title` | no | Short display title (e.g. "Launch nginx"). |
| `description` | no | Longer description of what to do. |
| `prompt` | yes | Question or instruction shown to the student. |
| `type` | yes | `multiple_choice`, `terminal_action`, `file_check`, or `informational` |
| `options` | no | Static answer choices (for multiple_choice). |
| `options_source` | no | `"dynamic"` — generate options at runtime from the validation command. |
| `validation` | yes | How to check the answer. |
| `error_message` | no | Shown on validation failure. |
| `hint` | no | Guiding question. Be vague. |

### 4. Validation

Controls how the frontend checks answers.

| Field | Required | Description |
|-------|----------|-------------|
| `command` | varies | Shell command to run inside the container. Required for `terminal_action` and `multiple_choice` (dynamic). |
| `expected_output` | varies | The expected result. Required for `exact`, `contains`, `regex` match types. |
| `match_type` | no | `contains` (default), `exact`, `regex`, or `line_count` |
| `script` | no | Path to a script inside the container (alternative to `command`). Must exit 0. |
| `path` | no | File path (for `file_check` type). |
| `contains` | no | String the file must contain (for `file_check`). |

### 5. Match Types

| Value | Behavior | Example |
|-------|----------|---------|
| `contains` (default) | Output contains the string | `"nginx"` matches `"nginx:alpine"` |
| `exact` | Output matches exactly | `"2"` matches `"2"` (but not `" 2"`) |
| `regex` | Output matched against regex | `.+` matches anything non-empty |
| `line_count` | Number of output lines | `"3"` matches exactly 3 lines |

## Adding More Tasks

When you add a new task to an existing lab:

1. **Add it to the `tasks` array** in the lab's `lab.yaml` — at the end or at a specific position.
2. **Give it a unique `id`** — descriptive names like `port-mapping`, `inspect-image`, `remove-image` are clearer than `task-4`, `task-5`.
3. **Choose the right `type`** — `terminal_action` for command-line tasks, `multiple_choice` for quizzes, `file_check` for file creation/modification, `informational` for read-only content.
4. **Write a validation command** — it runs inside the container. Keep it simple. Prefer `command` + `expected_output` over `script`.
5. **Write a hint** — ask a question, don't give the answer.
6. **No code changes needed** — the backend and orchestrator already handle all task types generically. The frontend reads the YAML directly and adapts to whatever `type` and `validation` fields you define.

The only time code changes would be needed is if you add a **new task type** (a new value for the `type` enum). In that case, you'd need to update:
- The JSON Schema (`lab-schema.json`) — add the new type to the `enum`
- The frontend — add a new UI component for the new type
- The frontend validation logic — handle the new type's check flow

## Hints

Hints should guide, not answer. Good hints ask questions.

```yaml
# Bad — gives away the answer
hint: "docker run -d --name web nginx:alpine"

# Good — asks a question
hint: "How do you name a container and run it in the background?"

# Good — points to a concept
hint: "What command shows port mappings for a container?"
```

## Validation Scripts

When `command` + `expected_output` isn't enough, use a `script`:

```yaml
validation:
  script: "./scripts/validate-task.sh"   # Must exit 0 for pass
```

The script runs inside the container and can check anything — file permissions, network membership, running processes, etc.

## Validation Errors

If the frontend encounters an error parsing your `lab.yaml`, it will show a message with a download link to the reference files:

- **Sample file**: `GET /schemas/sample` — Download the working example
- **JSON Schema**: `GET /schemas/yaml` — The formal schema definition

You can also validate programmatically:

```bash
# Download the schema
curl http://localhost:8001/schemas/yaml -o lab-schema.json

# Or with ajv-cli
npx ajv-cli validate -s lab-schema.json -d my-lab.yaml --spec=draft2020
```
