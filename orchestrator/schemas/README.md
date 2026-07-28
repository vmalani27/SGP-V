# lab.yaml — Course Author Guide

This directory contains the schema and reference files for writing course `lab.yaml` definitions.

## Files

| File | Purpose |
|------|---------|
| `lab-schema.json` | JSON Schema for validating `lab.yaml` files |
| `lab-sample.yaml` | Complete working example with 3 phases, 4 labs, 9 tasks |

## How the Contract Works

```
Course Author                    Backend                         Orchestrator
─────────────                    ───────                         ────────────
Writes lab.yaml
  ↓
Validates against lab-schema.json
  ↓
Publishes course
                                 Reads lab.yaml
                                 Extracts environment config
                                 Starts lab ─────────────────→   docker run {image}
                                                                   ↓
                                 Sends phase-0 commands ────→     docker exec (setup)
                                                                   ↓
                                 Shows task-1 prompt
                                 Student types in terminal
                                 Clicks "Check"
                                 Sends validation cmd ─────→     docker exec (validate)
                                                                returns output
                                 Compares to expected_output
                                 Unlocks task-2
```

**The orchestrator never reads `lab.yaml`.** The backend reads it and sends the environment config.

## Writing a lab.yaml

### 1. Environment

```yaml
environment:
  base_image: "sgp-lab-ubuntu:latest"   # Sysbox-compatible base
  apt_packages:                          # Optional: system packages to install at runtime
    - curl
    - vim
  pre_pull:                              # Optional: Docker images to pre-pull
    - nginx:alpine
```

Available base images (build from `orchestrator/lab-images/`):

| Image | What's included |
|-------|----------------|
| `sgp-lab-ubuntu:latest` | Ubuntu 22.04 + systemd + student user + sudo |
| `sgp-lab-docker:latest` | Same + Docker daemon (for DinD courses) |
| `sgp-lab-git:latest` | Same + git pre-installed |

### 2. Phases

Phases are ordered groups of labs. Use `phase-0` for environment setup, then `phase-1`, `phase-2`, etc. for content.

```yaml
phases:
  - id: "phase-0"
    title: "Environment Setup"
    type: "setup"               # Required for phase-0
    steps:
      - id: "install-tools"
        command: "apt-get update && apt-get install -y docker.io"
        description: "Install Docker"

  - id: "phase-1"
    title: "Getting Started"
    labs:
      - id: "lab-1"
        title: "First Lab"
        order: 1
        tasks: [...]
```

### 4. Labs

Each lab has tasks. Labs can optionally have setup commands that reset state.

```yaml
- id: "lab-1"
  title: "First Lab"
  order: 1
  setup:                              # Optional: runs before this lab
    - command: "docker rm -f web || true"
  tasks:
    - id: "task-1"
      prompt: "What command lists files?"
      type: "terminal_action"
      validation:
        command: "ls"
        expected_output: "Documents"
        match_type: "contains"
      hint: "Think about directory listing commands."
      error_message: "Expected to see 'Documents' in the output."
```

### 5. Task Types

| Type | What it does | Validation fields |
|------|-------------|-------------------|
| `multiple_choice` | Student picks from options | `expected_output` |
| `terminal_action` | Student types a command in the terminal | `command` + `expected_output` |
| `file_check` | Checks if a file exists/contains content | `path` + `contains` |
| `informational` | Read-only, no validation needed | None |

### 6. Match Types

Controls how `command` output is compared to `expected_output`.

| `match_type` | Behavior | Example |
|---------------|----------|---------|
| `contains` (default) | Output contains the string | `"nginx"` matches `"nginx:alpine"` |
| `exact` | Output matches exactly | `"2"` matches `"2"` |
| `regex` | Output matched against regex | `.+` matches anything non-empty |
| `line_count` | Number of output lines | `"3"` matches exactly 3 lines |

### 7. Hints

Hints should guide, not answer. Good hints ask questions. Bad hints give commands.

```yaml
# Bad — gives away the answer
hint: "docker run -d --name web nginx:alpine"

# Good — asks a question
hint: "Think about detached mode and how to name a container."

# Good — points to a concept
hint: "What command shows port mappings for a container?"

# Good — nudges toward the right flag
hint: "How do you specify which network a container joins?"
```

### 8. Validation Scripts (Complex Checks)

When `command` + `expected_output` isn't enough, use a script:

```yaml
validation:
  script: "./scripts/validate-task.sh"   # Must exit 0 for pass, non-zero for fail
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

# Validate with any JSON Schema tool
# https://www.jsonschemavalidator.net/
# https://ajv.js.org/

# Or with jq + ajv-cli
npx ajv-cli validate -s lab-schema.json -d my-lab.yaml --spec=draft2020
```
