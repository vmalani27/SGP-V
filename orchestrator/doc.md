The Local Orchestrator is a FastAPI-based service that acts as the control plane of the local learning platform. It is responsible for managing the complete lifecycle of lab environments, exposing a unified REST and WebSocket interface to the frontend, and communicating with the host Docker Engine through the Docker SDK. Unlike the cloud backend, which handles user authentication, course enrollment, and progress synchronization, the orchestrator never communicates directly with Firebase or stores persistent user data. Its sole purpose is to manage the student's local execution environment.

## Lab Lifecycle Management

The orchestrator's primary responsibility is lab lifecycle management. When a student selects a course from the frontend, the orchestrator identifies the appropriate lab definition and creates an isolated Sysbox-based container using the corresponding Docker image. It supports three lifecycle operations: stop (pause), resume (restart), and destroy (force remove). Since labs are ephemeral, the orchestrator cleans up all container resources when a session is destroyed.

## Terminal Management

The orchestrator provides an interactive Linux terminal through a WebSocket interface between the frontend and the running lab container. Using aiodocker's async exec streaming, the orchestrator bridges stdin/stdout between the browser (xterm.js) and the container's shell. The student gets a bash session as the `student` user, running inside the container with full terminal capabilities.

## Validation System

Each lab ships with its own `validator.sh` script that checks student work and outputs structured JSON. The orchestrator's only responsibility is to execute the script inside the container and return the parsed result. This separation means the orchestrator remains generic — it manages containers, terminals, and execution — while each lab encapsulates its own grading logic. As the catalog grows from Linux to Git, Docker, Kubernetes, or custom labs, no special-case validation code is needed in the backend.

## File Inspection

For grading and verification, the orchestrator provides file inspection capabilities. It can check whether files exist, read permissions, verify ownership, and retrieve file contents — all executed inside the container via `docker exec`. This ensures checks reflect the actual state inside the student's environment.

## Docker Runtime Integration

For Docker-course labs, the orchestrator controls the outer Sysbox container. Everything the student does with Docker happens inside. The orchestrator's validation scripts run `docker ps`, `docker inspect`, and other commands inside the student's Docker daemon, treating the lab like a VM. No host port exposure is needed — checks use `curl localhost:PORT` inside the container.
