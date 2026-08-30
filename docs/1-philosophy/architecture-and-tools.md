# Architecture and Tools: The "Why"

LabOps is built to provide isolated, authentic, and reproducible environments for DevOps education. Every tool in the stack was selected to solve specific pain points encountered when running hands-on labs for a room full of students.

## 1. Sysbox & Vagrant (The Orchestrator)

### The Problem
Teaching Docker means students need to run commands like `docker run`, `docker pull`, and `systemctl start docker`. 
- **Standard Docker-in-Docker (DinD):** Requires running containers in `--privileged` mode. If a student runs a malicious or accidental command, it can easily escape the container and compromise the host machine.
- **Mounting `/var/run/docker.sock`:** Gives the container root-equivalent access to the host daemon. Students sharing a daemon can see, kill, or overwrite each other's containers.

### The Solution: Sysbox
[Sysbox](https://github.com/nestybox/sysbox) is a dedicated container runtime (replacing `runc`) designed for "system containers". 
- It uses Linux user namespaces (`userns`) to map root inside the container to a non-privileged user on the host.
- It properly isolates cgroups, `/proc`, and `/sys`.
- **Result:** We can run systemd and the Docker Engine securely *inside* an unprivileged container. To the student, it feels identical to an isolated VM.

### Why Vagrant?
Sysbox requires specific Linux kernel features and doesn't run natively on macOS or Windows (Docker Desktop VMs abstract away the runtime). By packaging the orchestrator inside a Vagrant Ubuntu 22.04 VM, we ensure that **any developer on any OS** can spin up an identical, Sysbox-ready host with a single `vagrant up`.

## 2. Next.js (The Frontend)

### The Problem
The platform needs to be highly interactive: rendering markdown, rendering live interactive terminals (`xterm.js`), and handling authentication, all while maintaining a smooth SPA-like experience.

### The Solution: Next.js (App Router)
- **Component Architecture:** Perfect for encapsulating complex state (e.g., the terminal lifecycle, `xterm.js` addons, and lab progress tracking).
- **Client-Side Bootstrap:** The frontend pulls the raw content artifacts directly from S3, verifies their checksums, and renders them locally. Next.js easily handles this mix of client-side fetching and rich UI rendering.

## 3. FastAPI (The Backend & Orchestrator API)

### The Problem
We need two distinct APIs plus a client:
1. **The Backend (Host):** Handles course metadata, Firebase auth/enrollments/progress, and the content-version handshake (hands the S3 download URL to the client). Stateless and Firestore-backed; it never talks to the orchestrator.
2. **The Orchestrator (VM Guest):** Handles the heavy lifting of talking to the Docker SDK to spin up Sysbox containers, pipe `exec` streams for validation, and serve terminal WebSockets. The frontend calls it **directly** (REST lifecycle + `ws://…/ws/terminal`).

### The Solution: FastAPI
- **Async Python:** Ideal for I/O-bound work — Docker SDK calls, `exec` streams, and hundreds of concurrent, long-lived idle terminal WebSockets — without threading overhead.
- **Docker SDK:** The `aiodocker` and `docker` Python libraries are mature and robust for managing container lifecycles programmatically.
- **Type Safety:** Pydantic schemas ensure that the API contracts between the frontend, backend, and orchestrator are strictly validated. (The frontend holds the orchestrator's URL + shared secret; see `docs/architecture.md`.)

## 4. Firebase (Auth & Firestore)

### The Problem
User management, authentication, and progress tracking are necessary but are commodity features. Building a robust auth system and a scalable NoSQL database from scratch for a pilot is a distraction from the core value proposition (the isolated labs).

### The Solution: Firebase
- **Authentication:** Out-of-the-box JWT issuance and credential management.
- **Firestore:** A flexible NoSQL document store perfectly suited for storing the `taskResults` tree (`{courseId} -> {moduleId} -> {labId} -> {taskId}`) without needing rigid database migrations for early iteration.

## 5. S3 / Floci (Content Pipeline)

### The Problem
Lab content (YAML/Markdown) needs to be authored in Git, but serving raw Git files to the browser is inefficient and introduces coupling. 

### The Solution: S3 (Artifact Storage)
- **Immutability:** CI processes the raw Git content, compiles it into a validated `.tar.gz` artifact, and pushes it to S3.
- **Local Dev (Floci):** `localstack`/`floci` allows developers to test the full S3 publishing pipeline entirely locally without needing real AWS credentials.
- **Source of Truth:** The backend reads no files; the worker downloads the S3 artifact, seeds Firestore metadata, and the frontend downloads the S3 artifact to render the UI. This enforces a strict, scalable content delivery pipeline.
