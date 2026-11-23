ABSTRACT

Practical DevOps education requires working directly with terminal environments, system services, and container daemons. Existing educational platforms typically solve this by hosting virtual machines or container sandboxes in the cloud. While this approach allows students to start immediately in a browser, running dedicated cloud instances for every learner creates continuous compute costs, which platforms counter by imposing strict session time limits, aggressive idle timeouts, and subscription paywalls. On the other hand, asking students to configure exercises directly on their personal computers often leads to dependency conflicts, configuration mistakes that can break their operating system, and the friction of debugging local environments rather than learning course concepts.

LabOps is an open-source, local-first interactive learning platform designed to address this trade-off. Instead of running sandboxes in the cloud, LabOps runs isolated container environments directly on the student's machine while preserving the structured, in-browser interface typical of cloud platforms. The system uses a browser-based terminal connected via WebSockets to a local orchestrator that manages ephemeral Linux containers. Inside each sandbox, students have full root access to practice commands, write configurations, and run nested Docker containers without risking their host operating system. LabOps synchronizes learning content from a content delivery network and stores student progress locally. By running its core services on the student's machine, the platform reduces reliance on continuously running cloud infrastructure and avoids session limits imposed by hosted environments. However, its usability depends on the student's hardware and ability to run the required container runtime. This report presents the design and implementation of LabOps, with a focus on its local-first architecture, container isolation, and the trade-offs involved in building a self-hosted DevOps learning environment.


CHAPTER 1: INTRODUCTION

1. BACKGROUND OF THE PROJECT
DevOps and infrastructure engineering are fundamentally practical disciplines. A student cannot gain proficiency in containerization, system administration, or version control merely by watching video lectures or answering multiple-choice questions. They must interact directly with the operating system: inspect running processes, write configuration files, build container images, diagnose failing systemd units, and resolve merge conflicts.

Providing students with environments to practice these tasks safely is challenging. In academic labs and training programs, instructors often face two traditional approaches:
1. Cloud-hosted virtual sandboxes: Services spin up a remote Linux instance per student. This provides a clean interface in the browser with no installation requirements, but the recurring compute costs are high. As a result, sessions are strictly metered, time-limited, and shut down after brief periods of inactivity.
2. Local workstation setup: Students install tools directly on their host machines or manually set up virtual machines using software like VirtualBox or Vagrant. This eliminates cloud costs, but students spend significant time troubleshooting local configuration issues, differing host operating systems, and broken dependencies. More critically, exercises that require root privileges or network reconfiguration carry the risk of corrupting the student's primary operating system.

LabOps was conceived to find a practical middle ground: deliver the guided, browser-based experience of modern cloud learning platforms, but execute all containerized sandboxes locally on the student's hardware.

2. PROBLEM DEFINITION

2.1 Problem Statement
Learning modern infrastructure tools requires access to authentic Linux environments with administrative privileges. However, current delivery models force an undesirable trade-off:
- Cloud-hosted platforms incur continuous infrastructure costs for every running session, forcing providers to enforce strict time windows, queue times, and paywalls. Keystroke latency is tied to internet stability, and work is lost if the connection drops.
- Local virtualization and manual installs demand heavy workstation resources (often 4GB or more of RAM per VM), require slow boot cycles, and frequently suffer from configuration mismatches between host operating systems.
- Existing local setups lack automated grading capabilities, leaving students to guess whether their configuration or command achieved the desired state.

2.2 Motivation for the Project
The primary motivation behind LabOps is to make hands-on DevOps education accessible without recurring cloud compute costs or session time limits imposed by hosted platforms. When learning topics such as multi-stage Docker builds or Git conflict resolution, students need the freedom to experiment, make mistakes, and inspect system states without worrying about a session expiring.

LabOps uses container runtimes, user namespace isolation, and a local-first architecture to run the learning environment on the student's machine. The platform brings together an interactive terminal, task validator, Git server, and curriculum runner, managed through a single command-line application. Students can work in disposable environments where they can test commands, troubleshoot failures, and receive automated feedback. Meanwhile, the platform avoids the need to provision and maintain separate compute environments for every student.

3. OBJECTIVES AND SCOPE OF THE PROJECT
The objective of this project is to build an interactive, container-native DevOps learning platform that operates locally on commodity student hardware with zero ongoing cloud compute expenses.

The scope of the project includes:
• Developing a lightweight, cross-platform CLI tool in Go to verify host virtualization support and manage the local platform lifecycle.
• Building a responsive web application in Next.js that embeds an xterm.js terminal emulator alongside structured chapter slides and task checklists.
• Designing an orchestrator in Python (FastAPI) that interfaces with the local Docker daemon to provision ephemeral lab sandboxes, proxy PTY terminal streams over WebSockets, and run non-intrusive validation scripts.
• Implementing container-in-container sandboxes capable of running systemd as PID 1 and nested Docker daemons (dockerd) under both Sysbox user-namespace isolation and standard privileged fallback modes.
• Incorporating an embedded, self-hosted Git server (Gitea) to teach remote Git workflows locally without requiring external GitHub accounts.
• Engineering a headless content distribution pipeline that packages course curricula into versioned tarballs distributed via AWS CloudFront and Amazon S3, paired with an automated background sync daemon.
• Creating a local progress persistence mechanism that tracks completions offline in a local JSON file.
• Authoring two complete hands-on curriculum tracks: Docker Mastery and Git Fundamentals.


CHAPTER 2: LITERATURE REVIEW

1. CLOUD-BASED INTERACTIVE LAB PLATFORMS
Platforms such as KodeKloud, A Cloud Guru, and Katacoda popularized browser-based DevOps education. Their architecture involves provisioning a cloud virtual machine or container in a remote Kubernetes cluster whenever a user opens a scenario, streaming terminal I/O to an xterm.js canvas in the browser. 

The primary strength of this model is accessibility: a student on a low-powered laptop or Chromebook can access a full Linux environment with no local setup. However, the operational economics are challenging. Running dedicated compute instances for thousands of concurrent students creates steep cloud bills. To remain financially viable, platforms enforce session limits (typically 15 to 45 minutes), automatically terminate idle sessions, and restrict free-tier access. For self-paced learners, losing an active shell session because of a brief pause is frustrating. Furthermore, any network interruption freezes the terminal stream.

2. LOCAL VIRTUALIZATION AND VM-BASED ENVIRONMENTS
To avoid cloud expenses, academic institutions commonly rely on local virtual machines managed through VirtualBox, VMware, or Vagrant. This gives students complete control of an isolated Linux guest on their own hardware.

The drawback of this approach is resource intensity and operational friction. A full Linux VM typically reserves 2GB to 4GB of RAM and 15GB to 30GB of disk space, placing a heavy load on entry-level student laptops. Booting and provisioning a VM takes several minutes. More critically, running nested containers inside a virtual machine running on top of Windows or macOS frequently encounters hypervisor conflicts and I/O bottlenecks. Finally, standard VM setups do not provide automated, step-by-step grading; students must manually compare their output against written guides.

3. BROWSER-BASED WEBASSEMBLY TERMINAL PLAYGROUNDS
Recent projects like WebVM and v86 compile x86 CPU emulators and Linux kernels to WebAssembly (Wasm), allowing a miniature Linux environment to run directly inside the browser's JavaScript engine. 

While technically impressive and entirely cost-free to host, WebAssembly Linux environments have clear architectural limitations for DevOps training. Because they run in a sandboxed browser thread without direct hardware virtualization, they cannot run genuine Linux cgroups, cannot start systemd as an init system, and cannot execute production container engines like Docker. While suitable for basic shell commands, they cannot support exercises involving daemon management, network namespaces, or container builds.

4. COMPARATIVE ANALYSIS AND LIMITATIONS
The following table summarizes the trade-offs of existing educational sandbox approaches:

Platform Model | Hosting Cost | Workstation Load | Startup Time | Offline Capable | Docker / systemd Support
Cloud SaaS Labs | High (per minute) | Very Low (browser only) | Moderate (30–60s) | No (requires WAN) | Complete
Local Full VMs | Zero | High (4GB+ RAM, heavy disk) | Slow (60–120s) | Yes | Limited (nested virtualization issues)
Browser WebAssembly | Zero | Moderate (CPU emulation) | Fast (<10s) | Yes | None (no native cgroups/dockerd)
LabOps (Local Container) | Near Zero (static CDN only) | Low to Moderate (<350MB idle) | Fast (<5s cached) | Yes (after content sync) | Complete (via Sysbox / DinD)

5. PROPOSED APPROACH
LabOps adopts a container-native, local-first model. Instead of paying for cloud servers or forcing students into heavy VMs, LabOps treats the student's existing Docker engine as the virtualization host.

The design is built around four core principles:
1. Browser Interface with Local Execution: The student interacts through a clean browser dashboard and embedded terminal, but all network traffic and command execution stays on localhost.
2. Lightweight, Ephemeral Sandboxes: Exercises execute in lightweight Linux containers rather than full virtual machines. Containers boot in seconds and consume memory only when active.
3. Separation of Content and Platform: Course curricula are written in plain Markdown and YAML, packaged as static assets on a CDN, and pulled down by a background daemon. This means courses can be updated without rebuilding platform container images.
4. Local-First Data Ownership: Student progress is saved to a structured JSON file on their machine. The platform operates without an external user database or login requirement.


CHAPTER 3: SYSTEM ANALYSIS

1. FUNCTIONAL REQUIREMENTS

1.1 Local Sandbox Lifecycle Management:
• The system must dynamically provision isolated, disposable Docker containers for requested labs and interactive demos on demand.
• The orchestrator must track container status, apply inactivity timeouts (40 minutes for labs, 30 minutes for demos), and automatically clean up expired containers.
• The system must support label-based container recovery, allowing active sessions to reconnect if the orchestrator restarts.

1.2 In-Browser Terminal Streaming:
• The web client must establish a bidirectional WebSocket connection to the backend to stream terminal input and output.
• The backend must bridge the WebSocket to a pseudoterminal (PTY) attached to a tmux session inside the target sandbox container.
• Terminal sessions must maintain state: if a student navigates between slides or accidentally closes the browser tab, the container process must remain alive, and reconnecting must restore full terminal scrollback.

1.3 Automated Task Verification:
• The platform must provide an API endpoint to evaluate whether a student has completed a specific lab task.
• Validation checks must execute server-side commands inside the student's container (e.g., inspecting file contents, directory permissions, listening ports, or Docker image tags) without sending the grading logic or solution to the browser.
• The verification response must return a boolean pass/fail status and an informative error message explaining what condition was not met, without leaking the exact solution command.

1.4 Headless Content Delivery and Synchronization:
• The platform must fetch course manifests and content bundles from a static CDN edge (AWS CloudFront and Amazon S3).
• A background daemon must periodically poll for new releases, verify artifact integrity using SHA256 checksums, and atomically unpack updates into the local content directory.

1.5 Local-First User State Management:
• All student records—including enrolled courses, completed chapters, and task verification history—must be saved locally in ~/.labops/user_state.json.
• The application must not require internet authentication tokens, third-party cookies, or an external database to function.

1.6 Unified Gateway Routing:
• A reverse proxy must expose the platform on a single host port (default 3000), routing requests between the Next.js frontend, the FastAPI orchestrator, the embedded Git server, and WebSocket terminal streams.

1.7 CLI Control and Pre-Flight Checks:
• A command-line binary must provide straightforward controls to start, stop, restart, view logs, and update the platform.
• The CLI must include a diagnostics command (doctor) to verify hardware virtualization, Docker daemon availability, memory allocation, and port bindings.

2. NON-FUNCTIONAL REQUIREMENTS

2.1 Performance Requirements:
• Sandbox Startup Time: Provisioning and attaching to a new lab container must complete in under 5 seconds when container images are already cached locally.
• Keystroke Latency: Because terminal traffic routes over the local loopback interface (127.0.0.1), round-trip latency for terminal characters should remain below 15 milliseconds under normal conditions.
• Resource Footprint: The core supporting containers (Proxy, Frontend, Orchestrator, Sidecar) must consume less than 350MB of host RAM combined when idle.

2.2 Usability Requirements:
• Single-Command Launch: Starting the environment should require only running "labops start", which handles pre-flight validation, spins up the containers, and opens the user's browser automatically.
• Split-Screen Layout: The learning interface must present instructional text on the left and the interactive terminal on the right, allowing students to read instructions and execute commands without context-switching.

2.3 Security and Isolation Considerations:
• Containment: Commands executed within the student sandbox (including accidental commands like rm -rf / or fork bombs) must remain contained within the container environment and must not modify host system files.
• Process Leak Prevention: Disconnecting a browser terminal session must cleanly terminate the associated terminal attach process inside the container, preventing orphaned processes from accumulating and consuming system resources.


CHAPTER 4: TECHNOLOGY STACK

1. LIST OF LANGUAGES, FRAMEWORKS AND TOOLS USED

Table 4.1 Languages, Frameworks and Development Tools Used
Sr no. | Tool used | Category | Purpose in LabOps
1 | Go (1.22+) | Systems Programming | Compiling the standalone CLI (labops) and the background content-sync daemon.
2 | Python 3.12 | Backend Language | Implementing the container orchestration engine and validation logic.
3 | FastAPI | Web Framework | Providing asynchronous REST endpoints and WebSocket terminal handlers.
4 | Next.js 15 (React 19) | Frontend Framework | Server-side rendered web application, chapter slide viewer, and task dashboard.
5 | TypeScript | Programming Language | Typed implementation of frontend UI components, stores, and API clients.
6 | Tailwind CSS | CSS Framework | Responsive styling, split-screen UI layout, and dark mode interface.
7 | xterm.js | Terminal Component | Rendering ANSI terminal output and capturing keystrokes in the browser.
8 | Docker & Docker Compose | Containerization | Packaging platform services and orchestrating the local runtime stack.
9 | Sysbox (sysbox-runc) | Container Runtime | Providing user-namespace virtualization for unprivileged nested Docker and systemd.
10 | Nginx (Alpine) | Reverse Proxy | Single-port routing for web assets, REST APIs, Git traffic, and WebSockets.
11 | Gitea | Version Control Server | Lightweight embedded Git server running on SQLite for Git training labs.
12 | GitHub Actions | CI/CD Automation | Testing content validity, building container images, and uploading release tarballs.

Table 4.2 Infrastructure Services Used
Sr no. | Service Name | Role in the System
1 | AWS CloudFront | Global CDN distributing static curriculum tarballs and release manifests.
2 | Amazon S3 | Cloud storage hosting curriculum artifacts and compiled CLI binaries.
3 | Amazon ECR Public | Public container registry hosting pre-built platform images.


2. DESIGN RATIONALE: WHY THESE TOOLS WERE SELECTED

• Go for CLI and Synchronization Daemon:
The user-facing CLI and the background synchronization daemon are written in Go because it compiles to single, statically linked binaries with no runtime dependencies. The content-sync sidecar runs continuously in the background; in Go, it compiles to an Alpine container binary that consumes under 8MB of RAM and remains idle between polling cycles.

• FastAPI for the Container Orchestrator:
Interfacing with the Docker daemon and managing real-time WebSockets requires asynchronous I/O. FastAPI and Python's asyncio allow the orchestrator to handle concurrent container provisioning, WebSocket PTY streams, and HTTP verification requests without blocking the event loop. Python was also chosen because its Docker SDK is mature and expressive for container inspection and execution.

• Next.js 15 for the User Interface:
Next.js was selected because of its ability to read curriculum files directly from the local filesystem (/app/.content) on the server side. Because the content directory is mounted into the container, Next.js can parse markdown files and serve slides directly without making additional network calls to an API or database.

• xterm.js for Terminal Emulation:
xterm.js is the standard in-browser terminal library used by tools like VS Code. It provides full support for terminal capabilities, including ANSI escape codes, cursor positioning, vim/nano screen redrawing, and dynamic terminal window resizing.

• Sysbox Runtime for Container Isolation:
Running systemd as PID 1 and running Docker inside Docker (DinD) normally requires Docker's --privileged flag. However, --privileged disables container isolation, exposing raw host devices to the container. Sysbox (sysbox-runc) solves this on Linux and WSL2 by virtualizing /proc and /sys and utilizing Linux user namespaces. Root inside the container maps to an unprivileged user on the host, allowing systemd and dockerd to run without giving the container root access to the host kernel.

• Embedded Gitea Server:
Teaching Git remotes, branching, and pull requests requires a remote Git server. Using public GitHub would require students to create personal accounts, configure access tokens, and maintain internet access, while cluttering their public profiles with practice repositories. Embedding a lightweight Gitea instance on an internal Docker network provides an authentic remote Git experience entirely on localhost.

• AWS CloudFront and S3 for Static Content Delivery:
Rather than running an always-on content backend server in the cloud, all curriculum files are bundled into static tarballs and distributed through AWS CloudFront backed by Amazon S3. This provides fast global downloads, eliminates server maintenance for course distribution, and incurs minimal cost since requests are cached at edge locations.


CHAPTER 5: SYSTEM DESIGN

1. USE CASE DIAGRAM
The platform supports two distinct user workflows: the Student Learner and the Content Author.

Student Workflow:
1. The student runs "labops doctor" via the CLI to confirm their laptop supports virtualization and has Docker running.
2. The student runs "labops start", which initializes the local container stack and opens the web application at http://localhost:3000.
3. The student browses the curriculum catalog, selects a course (such as Docker Mastery), and reads the chapter slides.
4. When a lab begins, the student interacts with the live sandbox terminal embedded in their browser, executing commands with full root privileges inside the container.
5. The student clicks "Verify Task" to grade their work. The system inspects the container state and displays instant feedback.
6. Progress is saved locally on disk, allowing the student to stop and resume at any time.

Content Author Workflow:
1. The author writes course slides in Markdown and lab definitions in YAML under the content-v2 directory.
2. The author pushes changes to GitHub.
3. A GitHub Actions CI pipeline runs validation scripts (scripts/validate_content.py) to check markdown formatting, YAML schema adherence, and solution integrity.
4. The pipeline compiles deterministic tarballs, computes SHA256 hashes, and uploads the artifacts to Amazon S3, invalidating CloudFront edge caches.
5. Student machines running the sync daemon automatically detect the new release and unpack it locally.

2. ARCHITECTURE DIAGRAM
The system is divided into three tiers:

Tier 1: Cloud Content Distribution (Serverless GitOps)
- GitHub Actions CI/CD validates and packages the curriculum into content.tar.gz and updates catalog.json.
- Assets are deployed to Amazon S3 and distributed via AWS CloudFront CDN (d3rqfqpemi0u1s.cloudfront.net).
- Pre-built container images are pushed to Amazon ECR Public.

Tier 2: Local Platform Host Stack (Docker Compose on localhost)
- Proxy (Nginx, port 3000): Unified gateway routing HTTP, WebSocket, and Git traffic.
- Frontend (Next.js 15): Serves the learning dashboard, renders slides from local disk, and hosts the xterm.js terminal.
- Orchestrator (FastAPI, Python 3.12): Supervises sandbox lifecycles, manages WebSocket PTY terminal streams, and executes automated verification checks.
- Content-Sync Sidecar (Go): Background daemon that polls CloudFront for new content releases using HTTP ETags.
- Git Server (Gitea): Local Git remote for version control exercises.
- Host Persistence (~/.labops/): Stores user_state.json, unpacked course content, and Git repositories.

Tier 3: Isolated Student Sandboxes (labops-lab-* containers)
- Ubuntu 22.04 LTS base container with systemd (PID 1).
- Inner Docker daemon (dockerd) for container-building labs.
- Persistent tmux session attached to the orchestrator PTY bridge.
- Preloaded Docker image tarballs (alpine, nginx, python) to speed up lab boot times.

3. DATA PERSISTENCE AND STATE DESIGN
LabOps avoids remote databases entirely. All user data resides on the student's machine under ~/.labops/:
- ~/.labops/user_state.json: A structured JSON file recording student identity, enrolled courses, chapter checkpoints, and task verification records.
- ~/.labops/content/: The local mirror of the curriculum unpacked from CDN release tarballs. The Next.js frontend mounts this directory as read-only.
- ~/.labops/git-data/: Persistent storage for the embedded Gitea server, including repositories and SQLite databases.

Example schema of user_state.json:
{
  "profile": {
    "user_id": "student-local-uuid",
    "display_name": "Student",
    "created_at": "2026-10-28T10:00:00Z"
  },
  "courses": {
    "docker-mastery": {
      "enrolled": true,
      "current_chapter": "ch-04-building-images",
      "completed_chapters": ["ch-01-intro", "ch-02-containers", "ch-03-ports"],
      "completed_labs": ["lab-1", "lab-2"],
      "tasks_progress": {
        "lab-3": {
          "task-1": { "status": "completed", "completed_at": "2026-10-28T10:30:00Z" }
        }
      }
    }
  }
}

This design ensures that student progress is private, requires no account management infrastructure, and survives container restarts or platform updates.


CHAPTER 6: IMPLEMENTATION

1. MODULES AND SUBSYSTEMS

1.1 Unified Gateway (Nginx):
Configured as an Alpine-based reverse proxy listening on port 3000. It routes:
- / -> Next.js frontend
- /labs/ and /demos/ -> FastAPI orchestrator REST API
- /ws/terminal -> FastAPI orchestrator WebSocket endpoint (with HTTP/1.1 upgrade headers)
- /git/ -> Embedded Gitea instance
This eliminates CORS issues and provides a single URL for the user.

1.2 Learning Frontend (Next.js 15 & xterm.js):
The web interface is built using Next.js App Router and Tailwind CSS. The curriculum pages read directly from the filesystem (/app/.content) on the server side, parsing frontmatter and markdown into slides. The client interface features an adjustable split pane: slide instructions on the left, xterm.js terminal on the right. When a student enters a lab, the frontend requests a session from the orchestrator, connects its xterm.js instance to the resulting WebSocket URL, and renders the interactive terminal.

1.3 Content Synchronization Sidecar (Go):
A standalone Go program running inside a lightweight container. Every 15 minutes (or on startup), it performs a conditional HTTP request to the CloudFront CDN endpoint (releases/dev.json). If the remote ETag differs from the local release, it downloads the compressed tarball, verifies its SHA256 checksum, and atomically unpacks it into the shared /content volume.

1.4 Container Orchestrator (FastAPI):
The orchestrator manages the lifecycle of student lab containers using the Docker Engine API. Key responsibilities include:
- Provisioning containers with appropriate security profiles (Sysbox vs. privileged).
- Managing port mappings and labels for container discovery.
- Bridging incoming WebSockets to the container's interactive PTY session.
- Executing task verification commands inside running containers and returning structured results.

1.5 Sandbox Runtime Environments:
Custom Docker images built on Ubuntu 22.04 LTS. Each image is configured with:
- systemd enabled as the init system.
- An unprivileged user account ("student") with passwordless sudo rights.
- A pre-configured Docker daemon and cached base images (alpine, nginx) to avoid downloading images during timed labs.
- tmux pre-installed to manage terminal session persistence.

1.6 Standalone CLI (Go):
A single command-line binary (labops) compiled for Windows, macOS, and Linux. It wraps Docker Compose commands to provide simple management:
- labops start: Runs pre-flight checks, brings up containers, and opens the browser.
- labops stop: Gracefully shuts down running platform services.
- labops doctor: Inspects host hardware virtualization, memory, and Docker daemon connectivity.
- labops logs: Tails output from all core containers for troubleshooting.

1.7 Embedded Gitea Server:
A self-contained instance of Gitea running against an SQLite database. It initializes an administrator account on first boot and allows the orchestrator or student to create repositories for Git exercises without interacting with external hosting services.

2. KEY FEATURES AND IMPLEMENTATION DETAILS

2.1 System-Readiness Check Diagnostics and Hardware Probing:
Before starting containers, the CLI verifies that the host system has the necessary capabilities. On Windows, it queries the Windows Hypervisor Platform and WMI to confirm that hardware virtualization is enabled in BIOS/UEFI. On Linux, it inspects /proc/cpuinfo for the vmx or svm CPU flags. This prevents confusing Docker startup errors by alerting students upfront if virtualization is disabled.

2.2 Terminal Session Multiplexing and Process Cleanup:
A critical engineering challenge in web-based terminals is handling disconnections. If a user refreshes the page or experiences network stutter, a naive implementation would terminate the running shell, killing active processes. 

LabOps solves this by attaching each WebSocket connection to a persistent tmux session inside the container ("tmux new-session -A -s lab"). When the browser disconnects, tmux keeps the shell and any background processes running. When the user reconnects, they reattach to the existing session with their scrollback intact.

However, closing a WebSocket does not automatically terminate the underlying "docker exec" process, which can leave orphaned attach clients running inside the container. To fix this, each incoming connection records its shell PID to a temporary file (/tmp/tmux_client_<id>.pid). When the WebSocket closes, a cleanup handler reads this PID and sends SIGTERM to the specific attach client, preventing process leaks from accumulating.

2.3 Non-Intrusive Server-Side Task Grading:
To verify lab tasks without exposing solutions to the student's browser, the orchestrator executes test scripts directly in the container via Docker exec. For example, to verify a Docker networking task, the orchestrator might run a command inside the container to inspect whether a container named "web-app" is attached to a custom bridge network and responding on port 80. The raw exit code and output are evaluated server-side, and only a clean pass/fail status and guidance hint are returned to the frontend.

3. CODE IMPLEMENTATION EXAMPLES

Example 6.1: Hardware Virtualization Check (cli/doctor.go)
The CLI inspects host hardware virtualization flags across different operating systems:

func CheckVirtualization() (bool, error) {
    switch runtime.GOOS {
    case "windows":
        return getWindowsVirtualization()
    case "darwin":
        cmd := exec.Command("sysctl", "-n", "machdep.cpu.features")
        var out bytes.Buffer
        cmd.Stdout = &out
        if err := cmd.Run(); err != nil {
            return false, err
        }
        return strings.Contains(strings.ToLower(out.String()), "vmx"), nil
    case "linux":
        file, err := os.Open("/proc/cpuinfo")
        if err != nil {
            return false, err
        }
        defer file.Close()
        scanner := bufio.NewScanner(file)
        for scanner.Scan() {
            line := scanner.Text()
            if strings.HasPrefix(line, "flags") {
                for _, flag := range strings.Fields(line) {
                    if flag == "vmx" || flag == "svm" {
                        return true, nil
                    }
                }
            }
        }
        return false, nil
    default:
        return false, fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
    }
}

Example 6.2: Resilient ETag Verification in Content Sync (sidecars/content-sync/sync.go)
The background sync daemon validates that local files exist before accepting an HTTP 304 response:

func (s *Syncer) checkAndSync() error {
    targetURL := fmt.Sprintf("%s/releases/%s.json", s.cdnURL, s.channel)
    req, err := http.NewRequest("GET", targetURL, nil)
    if err != nil {
        return err
    }
    if s.lastETag != "" {
        req.Header.Set("If-None-Match", s.lastETag)
    }
    resp, err := s.client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    // If 304 is returned, confirm local content directory actually contains files
    if resp.StatusCode == http.StatusNotModified {
        coursesDir := filepath.Join(s.contentDir, "data", "courses")
        if fi, err := os.Stat(coursesDir); err == nil && fi.IsDir() {
            log.Printf("[content-sync] HTTP 304: Content up to date (ETag %s)", s.lastETag)
            return nil
        }
        // If content is missing locally, reset ETag and force full re-download
        log.Printf("[content-sync] HTTP 304 received but content missing locally; forcing download")
        s.lastETag = ""
        req.Header.Del("If-None-Match")
        resp, err = s.client.Do(req)
        if err != nil {
            return err
        }
        defer resp.Body.Close()
    }
    // Read response body, verify SHA256 checksum, and extract tarball...
    return nil
}

Example 6.3: WebSocket PTY Connection with Teardown (orchestrator/app/websocket/terminal.py)
The orchestrator attaches to tmux and cleans up orphan processes when the client disconnects:

@router.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    await websocket.accept()

    handshake = await _receive_handshake(websocket)
    if not handshake or not _verify_secret(handshake):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    session_id = handshake.get("session_id")
    container_id = _resolve_container(session_id)

    conn_id = secrets.token_hex(8)
    pidfile = f"/tmp/tmux_client_{conn_id}.pid"
    cmd = ["bash", "-c", f"echo $$ > {pidfile} && exec tmux new-session -A -s lab"]

    exec_instance = await docker_client.exec.create(
        container=container_id,
        cmd=cmd,
        stdin=True,
        stdout=True,
        stderr=True,
        tty=True,
    )
    stream = exec_instance.start()

    try:
        await asyncio.gather(
            _pipe_ws_to_docker(websocket, stream),
            _pipe_docker_to_ws(stream, websocket),
        )
    finally:
        # Terminate specific attach client process to prevent tmux session lockups
        await _kill_attach_client(docker_client, container_id, pidfile)
        await stream.close()

Example 6.4: Container Security Mode Selector (orchestrator/app/services/docker_service.py)
The orchestrator switches between Sysbox user-namespace isolation and standard privileged fallback:

def get_runtime_options() -> dict:
    if CONTAINER_RUNTIME_MODE in ("standard", "privileged", "dev"):
        logger.warning(
            "CONTAINER_RUNTIME_MODE is '%s'. Launching container with standard runc (privileged=True). "
            "This mode is intended for local development on Docker Desktop.",
            CONTAINER_RUNTIME_MODE,
        )
        return {"privileged": True}

    # Production / Secure Student Mode using Sysbox
    return {
        "runtime": "sysbox-runc",
        "privileged": False,
    }


CHAPTER 7: RESULTS

1. SCREENSHOTS OF THE FINAL PRODUCT 
The final product is a Web-based application that provides a structured, interactive environment for DevOps and cloud infrastructure learning, running containerized sandboxes locally on the student's workstation. The following screenshots illustrate the primary stages and interfaces of the application, from environment diagnostics and course navigation to interactive reading, terminal execution, and automated task verification. 

Fig 7.1 Course Dashboard and Enrollment Overview 
(Displays enrolled course tracks such as Docker Mastery and Git Fundamentals, overall progress indicators, completed chapter counters, and resume action triggers).

Fig 7.2 Course Syllabus and Module Roadmap Screen 
(Presents the structured curriculum hierarchy, detailing module objectives, chapter sequences, and corresponding laboratory exercises for the selected course).

Fig 7.3 Interactive Chapter Reader with Embedded Sandbox Terminal 
(Shows the dual-column learning layout featuring instructional theory and concrete command examples on the left, paired with an integrated terminal on the right for immediate experimentation).

Fig 7.4 Hands-on Lab Environment with Task Checklist and Live Shell 
(Demonstrates an active laboratory exercise with declarative step-by-step task requirements and hints on the left pane, alongside an interactive root shell connected to the student's sandbox container on the right pane).

Fig 7.5 Real-Time Automated Task Verification Feedback 
(Illustrates the outcome of submitting a completed lab task for server-side evaluation, showing structured verification confirmation and diagnostic feedback without exposing underlying grading scripts).

Fig 7.6 CLI Pre-Flight System Diagnostics Output (labops doctor) 
(Shows the command-line interface verifying CPU hardware virtualization, Docker daemon availability, memory allocation, and CDN edge connectivity prior to platform launch).

## 2. EXPLANATION OF THE FUNCTIONALITY ACHIEVED

The implemented system provides an end-to-end environment for running, managing, and verifying interactive DevOps learning exercises locally. The major functionality of LabOps is described below.

### 2.1 Host Diagnostics and Platform Startup

LabOps provides a standalone Go command-line application that manages the initial setup and startup of the local platform. Before starting the platform, the `labops doctor` command checks whether the host satisfies the basic requirements needed to run the system.

The diagnostic process checks the availability of hardware virtualization, the Docker daemon, and the required network port. On supported systems, the CLI uses operating system interfaces such as WMI/CIM on Windows or `/proc/cpuinfo` on Linux to determine whether CPU virtualization is enabled. It also verifies that Docker is accessible and that port 3000 is available for the web interface.

After the checks pass, the `labops start` command starts the required platform services using Docker Compose and opens the LabOps interface at `http://localhost:3000` in the default browser. This provides a single entry point for the learner instead of requiring them to manually configure and start individual containers.

### 2.2 Browser-Based Terminal

LabOps provides an interactive terminal directly inside the web interface. The frontend is implemented using Next.js 15 and xterm.js. xterm.js handles terminal rendering in the browser and supports standard ANSI terminal behaviour, including coloured output, cursor movement, interactive programs, and terminal resizing.

Terminal communication is handled through a bidirectional WebSocket connection between the browser and the FastAPI orchestrator. The connection is routed through the local Nginx reverse proxy. The orchestrator then connects the session to the terminal process running inside the student's lab container.

Since the communication remains within the local machine, terminal interaction does not depend on the network latency of a remote cloud environment. Under normal local conditions, the system is designed to keep terminal response time below 15 milliseconds.

### 2.3 Terminal Session Persistence and Process Cleanup

A web-based terminal must handle temporary browser or network disconnections without terminating the underlying shell. LabOps addresses this using tmux sessions inside the lab container.

When a student starts a lab, the orchestrator attaches the WebSocket connection to a persistent tmux session using `tmux new-session -A -s lab`. The shell and processes running inside the tmux session therefore continue even if the browser connection is interrupted. When the student reconnects, the orchestrator can attach the new terminal connection to the existing session.

This allows a student to refresh the page, move between slides, or temporarily lose the browser connection without losing the running shell or its processes.

The system also handles cleanup of individual terminal attachment processes. Each WebSocket connection creates a separate tmux client process, and its process ID is recorded in a per-connection pidfile such as `/tmp/tmux_client_<id>.pid`. When the WebSocket connection closes, the orchestrator terminates that specific client process. This prevents disconnected attachment processes from accumulating while leaving the underlying tmux session available for reconnection.

### 2.4 Containerized Lab Environments

LabOps provides disposable container environments for practical exercises. These environments need to support operations that are normally restricted inside ordinary application containers, such as using root privileges, running system services with systemd, and building Docker images.

On Linux and WSL2 environments, LabOps uses the Sysbox container runtime (`sysbox-runc`) for these sandbox containers. Sysbox provides additional isolation through user namespaces and virtualized system interfaces, allowing systemd and an inner Docker daemon to operate inside the container without requiring the usual privileged container configuration.

This allows a lab to behave more like a small Linux system while remaining separate from the student's main operating system.

On Windows Docker Desktop environments where Sysbox is not available, LabOps uses standard `runc` as a fallback. In this mode, dedicated volume mounts are used for the inner Docker daemon's storage, including `/var/lib/docker`, to avoid conflicts between the nested Docker storage and the outer Docker environment.

The two execution modes therefore provide different levels of isolation depending on the host environment. The fallback mode does not provide the same user-namespace isolation as the Sysbox configuration.

### 2.5 Automated Task Verification

LabOps provides server-side verification for practical lab tasks. Instead of requiring students to submit screenshots or rely on client-side checks, the orchestrator directly inspects the state of the lab container when the student selects `Verify Task`.

Depending on the task, the verifier can check filesystem paths, file permissions, listening ports, Docker image tags, and other properties of the container environment. The checks are performed by the orchestrator and are not exposed as client-side verification logic.

The verification process produces a structured JSON response containing the task status and feedback. This allows students to repeatedly test their work while completing a lab and provides immediate feedback without requiring the complete solution to be displayed in the browser.

### 2.6 Curriculum Distribution and Synchronization

LabOps separates learning content from the application containers so that course material can be updated independently of the platform itself. Course content is authored using structured Markdown and YAML files.

A GitHub Actions workflow validates the content, generates the course catalog, and packages the required course files into compressed release archives. These releases are stored in Amazon S3 and distributed through Amazon CloudFront.

A lightweight Go content synchronization service runs on the student's machine. It checks the CloudFront release endpoint periodically and also performs a check when it starts. The service uses HTTP ETags to determine whether a new release is available. When an update is detected, it downloads the release archive, verifies its SHA256 checksum, and atomically extracts the new content into the shared `/content` volume.

Because the course content is distributed separately from the application images, updating learning material does not require rebuilding or replacing the core LabOps containers.

### 2.7 Local Progress Persistence

LabOps stores student progress locally on the student's machine. The main progress state is stored in `~/.labops/user_state.json` and includes information such as enrolled courses, completed chapters, completed labs, and verification-related progress.

The platform does not require third-party authentication, external OAuth redirects, or a remote database for this core progress data. Updates use a read-modify-write process with file-locking safeguards to reduce the possibility of conflicting writes when multiple updates occur close together.

Task-level progress within an active lab is also maintained in the browser using `localStorage`. This separates temporary browser state from the persistent progress state maintained by the application.

Once the required container images and course releases have been downloaded, the core learning environment can continue to operate without an active internet connection. Internet access is still required when new content or container images need to be downloaded.

### 2.8 Embedded Git Server

LabOps includes a local Gitea server to provide Git exercises without requiring students to create accounts on an external Git hosting service.

Gitea runs as part of the local Docker environment and uses an SQLite database together with local Git repositories. Students can therefore perform realistic Git workflows such as cloning repositories over HTTP, creating and managing branches, pushing commits, and resolving merge conflicts.

This gives Git exercises a persistent remote repository within the local LabOps environment while keeping the learning workflow independent of external Git hosting services.

### 2.9 System Evaluation and Practical Constraints

The implemented system was evaluated based on startup time, terminal responsiveness, hardware requirements, and storage usage.

When the required container images are already available locally, the core LabOps environment starts in less than three seconds. Since the frontend, orchestrator, and lab containers communicate locally, terminal interaction remains responsive without depending on network latency.

The platform requires a Docker-compatible system with hardware virtualization and at least 8 GB of RAM for the complete set of services and lab environments. The available container isolation also depends on the host environment. Linux and WSL2 can use Sysbox for stronger isolation, while Windows Docker Desktop uses standard runc as a fallback.

LabOps also requires local storage for its container images. The core platform services occupy approximately 809 MB, while the additional sandbox environments require several gigabytes depending on the courses installed. Some Docker-focused environments include pre-cached base images to allow exercises to run without downloading additional images during the lab.

CHAPTER 8: CHALLENGES FACED

1. DEVELOPMENT CHALLENGES

1.1 Running systemd and Docker Inside Unprivileged Containers:
Teaching container concepts requires running Docker inside a container (Docker-in-Docker), and teaching Linux service administration requires systemd as PID 1. Standard Docker containers cannot run systemd because they lack access to the cgroup filesystem, and running dockerd normally requires the --privileged flag. Finding a solution that worked safely on developer workstations without exposing raw host devices required significant testing.

1.2 Orphaned Process Leaks in Terminal Bridges:
When bridging WebSockets to Docker exec streams, disconnecting the client browser closed the WebSocket connection but left the "docker exec tmux attach" process alive inside the container. Over a 30-minute learning session with frequent page navigation, dozens of orphaned attach processes accumulated, eventually freezing the tmux session and preventing further input or output.

1.3 CDN Caching Edge Cases in Content Sync:
The Go content-sync daemon initially relied strictly on HTTP ETags. If a student deleted or corrupted their local content folder while retaining the cached ETag in the daemon's state, CloudFront returned HTTP 304 Not Modified, assuming the client still had the files. This left the student with an empty course catalog and no obvious way to recover.

1.4 Cross-Platform Hardware Diagnostics:
Building a reliable "doctor" command in Go that accurately detects CPU virtualization flags required handling three different operating systems. Standard Go runtime packages do not expose CPU microcode features or hypervisor presence, meaning platform-specific system calls and OS commands were necessary.

1.5 Concurrency in Local File-Based State:
Storing progress in a local JSON file created race conditions when multiple fast verification requests occurred, occasionally resulting in partial JSON writes or corrupted state files.

2. SOLUTIONS AND WORKAROUNDS

2.1 Dual-Runtime Container Management:
To solve the containerization dilemma, the orchestrator was designed with a runtime selector. On Linux and WSL2, it configures the container with "runtime: sysbox-runc" and "privileged: false", providing full user-namespace isolation for systemd and inner dockerd. On Windows Docker Desktop where Sysbox is unavailable, it falls back to privileged execution while isolating inner container storage in dedicated Docker volumes (/var/lib/docker) to prevent filesystem overlay conflicts.

2.2 Per-Connection PID Tracking and Teardown Handlers:
To resolve orphaned terminal processes, each incoming terminal connection writes its internal PID to a unique file (/tmp/tmux_client_<conn_id>.pid) upon launching the tmux attach command. In FastAPI's WebSocket disconnect handler, a cleanup routine reads this pidfile and sends SIGTERM directly to that process. This guarantees that every disconnected terminal client is immediately terminated, eliminating process leaks.

2.3 Resilient 304 Validation in Sidecar Daemon:
The synchronization logic was updated to verify that local course directories actually exist on disk before honoring an HTTP 304 Not Modified response. If the files are absent, the daemon clears its stored ETag and re-issues an unconditional GET request to force a full re-download.

2.4 Native Platform Probing with Build Tags:
Platform-specific Go files (doctor_sys_windows.go, doctor_sys_other.go) were created using Go build tags. On Windows, the CLI queries WMI and PowerShell to check Hyper-V and virtualization status. On Linux, it directly parses /proc/cpuinfo for the vmx and svm flags.

2.5 Atomic Read-Modify-Write File Handling:
The frontend user state handler was refactored to use file-locking mechanisms and atomic write patterns (writing to a temporary file and renaming it to user_state.json). This ensures that concurrent task completions never corrupt the JSON structure.


CHAPTER 9: CONCLUSION AND FUTURE SCOPES

1. SUMMARY OF ACHIEVEMENTS
LabOps demonstrates that hands-on DevOps education does not require expensive per-student cloud compute fleets. By combining local container orchestration, in-browser terminal multiplexing, headless CDN content delivery, and local-first data persistence, the platform delivers an authentic Linux and Docker learning environment directly on commodity student hardware.

The project successfully implements:
• A unified local stack that boots in seconds with a single CLI command.
• Low-latency terminal interaction with session persistence powered by tmux over WebSockets.
• Objective, automated grading that inspects container system states server-side without leaking solutions.
• A headless, serverless curriculum publishing workflow using GitHub Actions and AWS CloudFront.
• A local-first progress model that respects student privacy and operates offline after initial downloads.

2. FUTURE SCOPE AND POTENTIAL ENHANCEMENTS

2.1 Multi-Distribution Lab Sandboxes:
Currently, lab images are based on Ubuntu 22.04 LTS. Future work includes building Enterprise Linux images (RHEL 9 or Rocky Linux) to support comparative systems administration labs covering package managers (dnf vs. apt) and enterprise security policies (SELinux vs. AppArmor).

2.2 Local Lightweight Kubernetes Integration:
While Docker exercises are fully operational, expanding the platform into advanced container orchestration will require running lightweight Kubernetes clusters (such as K3s or KinD) inside the local sandboxes to teach pod scheduling, service mesh configuration, and ingress management.

2.3 Content Integrity Verification:
Introducing cryptographic structural hashing (structuralHash) for course slides will ensure that local course files have not been modified or corrupted before rendering in the student's browser.

2.4 Air-Gapped Export Packaging:
For academic environments with restricted or intermittent internet connectivity, developing an offline bundle exporter ("labops bundle export") will allow instructors to distribute container images and course tarballs over a local USB drive or local area network without requiring CDN access.


REFERENCES

Docker Engine Architecture and Specifications: https://docs.docker.com/engine/
Sysbox Container Runtime Specification (Nestybox): https://github.com/nestybox/sysbox
Next.js 15 Documentation: https://nextjs.org/docs
FastAPI Framework Reference: https://fastapi.tiangolo.com/
xterm.js Terminal Emulator API: https://xtermjs.org/
The Go Programming Language Documentation: https://go.dev/doc/
Gitea Documentation (Lightweight Git Service): https://docs.gitea.com/
Amazon Web Services (AWS) CloudFront Developer Guide: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/
Amazon Simple Storage Service (S3) Documentation: https://docs.aws.amazon.com/s3/
Amazon Elastic Container Registry Public (Amazon ECR Public): https://docs.aws.amazon.com/AmazonECR/latest/public/
Nginx Reverse Proxy Documentation: https://nginx.org/en/docs/
tmux Manual and Terminal Multiplexer Architecture: https://man7.org/linux/man-pages/man1/tmux.1.html
GitHub Actions Documentation: https://docs.github.com/en/actions
Linux Namespaces and Cgroups v2 Kernel Documentation: https://man7.org/linux/man-pages/man7/namespaces.7.html
