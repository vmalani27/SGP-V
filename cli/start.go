package main

import (
	"bytes"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// CheckPortAvailable checks if a local TCP port is free to bind.
func CheckPortAvailable(port int) bool {
	address := fmt.Sprintf("127.0.0.1:%d", port)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

// OpenBrowser opens the default web browser to the specified URL.
func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		return fmt.Errorf("unsupported platform for open browser: %s", runtime.GOOS)
	}
	return cmd.Start()
}

// PollEndpoint pings an HTTP URL and returns true when it responds with 200 OK.
func PollEndpoint(url string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	client := http.Client{
		Timeout: 2 * time.Second,
	}

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return true
		}
		time.Sleep(2 * time.Second)
	}
	return false
}

// PollOrchestratorEndpoint checks the orchestrator health via the Nginx gateway or legacy port.
func PollOrchestratorEndpoint(timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	client := http.Client{
		Timeout: 2 * time.Second,
	}

	for time.Now().Before(deadline) {
		// 1. Check unified gateway endpoint
		if resp, err := client.Get("http://localhost:3000/health"); err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return true
		}
		// 2. Check legacy standalone port
		if resp, err := client.Get("http://localhost:8001/health"); err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return true
		}
		time.Sleep(2 * time.Second)
	}
	return false
}

// IsDockerDaemonRunning checks if the local Docker daemon is responsive.
func IsDockerDaemonRunning() bool {
	cmd := exec.Command("docker", "info")
	return cmd.Run() == nil
}

// ToWSLPath converts a Windows file path (e.g. D:\repo) to a WSL path (e.g. /mnt/d/repo).
func ToWSLPath(path string) string {
	abs, err := filepath.Abs(path)
	if err == nil {
		path = abs
	}
	path = filepath.Clean(path)
	if len(path) >= 2 && path[1] == ':' {
		drive := strings.ToLower(string(path[0]))
		rest := strings.ReplaceAll(path[2:], `\`, `/`)
		return fmt.Sprintf("/mnt/%s%s", drive, rest)
	}
	return filepath.ToSlash(path)
}

// CheckWSLDockerReady checks if a WSL2 Linux distribution with systemd and Docker is available.
func CheckWSLDockerReady() (bool, string) {
	if runtime.GOOS != "windows" {
		return false, ""
	}
	sysd, distro, err := CheckWSL2Systemd()
	if err != nil || !sysd || distro == "" || distro == "native" {
		return false, ""
	}
	// Fast path
	cmd := exec.Command("wsl.exe", "-d", distro, "docker", "info")
	if cmd.Run() == nil {
		return true, distro
	}

	// Warm-up path: trigger docker startup and poll briefly to handle daemon start race condition
	_ = exec.Command("wsl.exe", "-d", distro, "sudo", "service", "docker", "start").Run()
	_ = exec.Command("wsl.exe", "-d", distro, "systemctl", "start", "docker").Run()

	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(1 * time.Second)
		if exec.Command("wsl.exe", "-d", distro, "docker", "info").Run() == nil {
			return true, distro
		}
	}

	return false, ""
}

// EnsureDockerReady ensures that the target Docker engine (host or WSL2) is active and ready to process commands.
func EnsureDockerReady(wslDistro string) bool {
	if _, _, err := RunDockerCmd(wslDistro, "info"); err == nil {
		return true
	}

	if wslDistro != "" && wslDistro != "native" {
		_ = exec.Command("wsl.exe", "-d", wslDistro, "sudo", "service", "docker", "start").Run()
		_ = exec.Command("wsl.exe", "-d", wslDistro, "systemctl", "start", "docker").Run()
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(1 * time.Second)
		if _, _, err := RunDockerCmd(wslDistro, "info"); err == nil {
			return true
		}
	}

	return false
}

// IsAlreadyHealthy performs a fast check to see if the LabOps stack is already running and responsive.
func IsAlreadyHealthy() bool {
	client := http.Client{Timeout: 1200 * time.Millisecond}

	// 1. Check frontend
	resp, err := client.Get("http://localhost:3000")
	if err != nil || resp.StatusCode < 200 || resp.StatusCode >= 500 {
		return false
	}
	resp.Body.Close()

	// 2. Check orchestrator via gateway or direct fallback
	if resp2, err := client.Get("http://localhost:3000/health"); err == nil && resp2.StatusCode == http.StatusOK {
		resp2.Body.Close()
		return true
	} else if resp2 != nil {
		resp2.Body.Close()
	}

	if resp3, err := client.Get("http://localhost:8001/health"); err == nil && resp3.StatusCode == http.StatusOK {
		resp3.Body.Close()
		return true
	} else if resp3 != nil {
		resp3.Body.Close()
	}

	return false
}

// RunDockerCmd executes a docker CLI command either natively on host or inside WSL2 if wslDistro is specified.
func RunDockerCmd(wslDistro string, args ...string) (string, string, error) {
	var cmd *exec.Cmd
	if wslDistro != "" && wslDistro != "native" {
		fullArgs := append([]string{"-d", wslDistro, "docker"}, args...)
		cmd = exec.Command("wsl.exe", fullArgs...)
	} else {
		cmd = exec.Command("docker", args...)
	}
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	err := cmd.Run()
	return strings.TrimSpace(outBuf.String()), strings.TrimSpace(errBuf.String()), err
}

func cleanStaleContainers(wslDistro string) {
	stackContainers := []string{"labops-proxy", "labops-frontend", "labops-orchestrator", "labops-git-server", "labops-content-sync"}
	args := append([]string{"rm", "-f"}, stackContainers...)
	_, _, _ = RunDockerCmd(wslDistro, args...)
}

// StartNativeStack manages the container stack natively without docker-compose.
func StartNativeStack(wslDistro string) bool {
	modeName := "Docker Desktop / Local Mode"
	if wslDistro != "" && wslDistro != "native" {
		modeName = fmt.Sprintf("Native WSL2 Mode (%s)", wslDistro)
	}

	fmt.Printf("\nStarting LabOps in %s...\n", modeName)
	fmt.Println("--------------------------------------------------")

	if !EnsureDockerReady(wslDistro) {
		fmt.Println("Error: Docker daemon did not respond in time.")
		fmt.Println("Please ensure Docker is running or start Docker inside WSL2.")
		return false
	}

	// Fast-path: if workspace is already running and healthy
	if IsAlreadyHealthy() {
		fmt.Println("LabOps is already running at http://localhost:3000")
		_ = OpenBrowser("http://localhost:3000")
		return true
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Printf("Error: Unable to determine home directory: %v\n", err)
		return false
	}

	labopsDir := filepath.Join(homeDir, ".labops")
	_ = os.MkdirAll(labopsDir, 0755)
	contentDir := filepath.Join(labopsDir, "content")
	_ = os.MkdirAll(contentDir, 0755)
	gitDataDir := filepath.Join(labopsDir, "git-data")
	_ = os.MkdirAll(gitDataDir, 0755)

	var labopsVol, contentVol, gitDataVol, runtimeMode string
	if wslDistro != "" && wslDistro != "native" {
		labopsVol = ToWSLPath(labopsDir)
		contentVol = ToWSLPath(contentDir)
		gitDataVol = ToWSLPath(gitDataDir)
		runtimeMode = "sysbox"
	} else {
		labopsVol = labopsDir
		contentVol = contentDir
		gitDataVol = gitDataDir
		runtimeMode = "privileged"
	}

	reg := registryBase()
	chanName := selectedChannel()
	cdnURL := GetContentCDNURL()

	// [1/4] Preparing workspace network
	fmt.Print("[1/4] Preparing workspace network... ")
	_, _, _ = RunDockerCmd(wslDistro, "network", "create", "labops-net")

	// Silently stop and remove stale containers to avoid name/port conflicts
	cleanStaleContainers(wslDistro)
	fmt.Println("done.")

	// Check if port 3000 is still occupied after removing stale containers
	if !CheckPortAvailable(3000) {
		fmt.Println("\nError: Port 3000 is already in use by another application on your machine.")
		fmt.Println("Please close the conflicting application or run 'labops stop' to reset stale containers.")
		return false
	}

	// [2/4] Starting core services (git-server, content-sync, orchestrator)
	fmt.Print("[2/4] Starting core services... ")

	// Git Server
	gitImage := reg + "/labops-git-server:latest"
	gitCmd := []string{
		"run", "-d",
		"--name", "labops-git-server",
		"--net", "labops-net",
		"--net-alias", "git-server",
		"--restart", "unless-stopped",
		"-p", "3001:3000",
		"-v", gitDataVol + ":/data",
		"-e", "USER_UID=1000",
		"-e", "USER_GID=1000",
		"-e", "GITEA__database__DB_TYPE=sqlite3",
		"-e", "GITEA__database__PATH=/data/gitea/gitea.db",
		"-e", "GITEA__security__INSTALL_LOCK=true",
		"-e", "GITEA__security__SECRET_KEY=labops-secret-gitea-key-prod-random",
		"-e", "GITEA__server__DOMAIN=localhost",
		"-e", "GITEA__server__HTTP_PORT=3000",
		"-e", "GITEA__server__ROOT_URL=http://localhost:3000/git/",
		"-e", "GITEA__server__DISABLE_SSH=true",
		"-e", "GITEA__server__LFS_START_SERVER=false",
		"-e", "GITEA__service__DISABLE_REGISTRATION=false",
		"-e", "GITEA__service__REQUIRE_SIGNIN_VIEW=false",
		"-e", "GITEA__service__ENABLE_CAPTCHA=false",
		"-e", "GITEA__repository__ENABLE_PUSH_CREATE_USER=true",
		"-e", "GITEA__repository__DEFAULT_PRIVATE=public",
		gitImage,
		"sh", "-c", "(/bin/sh -c 'until su-exec git gitea admin user list >/dev/null 2>&1; do sleep 2; done; su-exec git gitea admin user create --username student --password password123 --email student@example.local --admin || true') & exec /usr/bin/entrypoint",
	}
	if _, stderr, err := RunDockerCmd(wslDistro, gitCmd...); err != nil {
		fmt.Println("FAILED")
		fmt.Printf("Error starting Git Server: %s\n", stderr)
		return false
	}

	// Content Sync
	syncImage := reg + "/labops-content-sync:" + chanName
	syncCmd := []string{
		"run", "-d",
		"--name", "labops-content-sync",
		"--net", "labops-net",
		"--net-alias", "content-sync",
		"--restart", "unless-stopped",
		"-v", contentVol + ":/content:rw",
		"-e", "CONTENT_PUBLIC_BASE_URL=" + cdnURL,
		"-e", "CONTENT_DIR=/content",
		"-e", "SYNC_INTERVAL=15m",
		"-e", "SYNC_ON_START=true",
		syncImage,
	}
	if _, stderr, err := RunDockerCmd(wslDistro, syncCmd...); err != nil {
		fmt.Println("FAILED")
		fmt.Printf("Error starting Content Sync: %s\n", stderr)
		return false
	}

	// Orchestrator
	orchImage := reg + "/labops-orchestrator:" + chanName
	orchCmd := []string{
		"run", "-d",
		"--name", "labops-orchestrator",
		"--net", "labops-net",
		"--net-alias", "orchestrator",
		"--restart", "unless-stopped",
		"--privileged",
		"--user", "0:0",
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-e", "DOCKER_HOST=unix:///var/run/docker.sock",
		"-e", "LAB_PREFIX=labops-lab",
		"-e", "DEMO_PREFIX=labops-demo",
		"-e", "LAB_TIMEOUT_MINUTES=40",
		"-e", "DEMO_TIMEOUT_MINUTES=30",
		"-e", "CONTAINER_RUNTIME_MODE=" + runtimeMode,
		"-e", "ORCHESTRATOR_SECRET=local-dev-super-secret",
		orchImage,
	}
	if _, stderr, err := RunDockerCmd(wslDistro, orchCmd...); err != nil {
		fmt.Println("FAILED")
		fmt.Printf("Error starting Orchestrator: %s\n", stderr)
		return false
	}
	fmt.Println("done.")

	// [3/4] Initializing gateway and web UI
	fmt.Print("[3/4] Initializing gateway and web UI... ")

	// Frontend
	feImage := reg + "/labops-frontend:" + chanName
	feCmd := []string{
		"run", "-d",
		"--name", "labops-frontend",
		"--net", "labops-net",
		"--net-alias", "frontend",
		"--restart", "unless-stopped",
		"-v", labopsVol + ":/app/.user_data",
		"-v", contentVol + ":/app/.content:ro",
		"-e", "NODE_ENV=production",
		"-e", "NEXT_TELEMETRY_DISABLED=1",
		"-e", "INTERNAL_ORCHESTRATOR_URL=http://orchestrator:8000",
		"-e", "NEXT_PUBLIC_ORCHESTRATOR_SECRET=local-dev-super-secret",
		"-e", "USER_DATA_DIR=/app/.user_data",
		"-e", "CONTENT_LOCAL_DIR=/app/.content",
		feImage,
	}
	if _, stderr, err := RunDockerCmd(wslDistro, feCmd...); err != nil {
		fmt.Println("FAILED")
		fmt.Printf("Error starting Frontend: %s\n", stderr)
		return false
	}

	// Proxy
	proxyImage := reg + "/labops-proxy:" + chanName
	proxyCmd := []string{
		"run", "-d",
		"--name", "labops-proxy",
		"--net", "labops-net",
		"--net-alias", "proxy",
		"--restart", "unless-stopped",
		"-p", "3000:80",
		proxyImage,
	}
	if _, stderr, err := RunDockerCmd(wslDistro, proxyCmd...); err != nil {
		fmt.Println("FAILED")
		if strings.Contains(strings.ToLower(stderr), "port is already allocated") || strings.Contains(strings.ToLower(stderr), "address already in use") {
			fmt.Println("\nError: Port 3000 is already in use by another application on your machine.")
			fmt.Println("Please close the conflicting application or run 'labops stop' to reset stale containers.")
		} else {
			fmt.Printf("Error starting Proxy gateway: %s\n", stderr)
		}
		return false
	}
	fmt.Println("done.")

	// [4/4] Verifying health
	fmt.Print("[4/4] Verifying health... ")
	frontendURL := "http://localhost:3000"
	if !PollOrchestratorEndpoint(45*time.Second) || !PollEndpoint(frontendURL, 45*time.Second) {
		fmt.Println("FAILED")
		fmt.Println("Error: Workspace took too long to respond. Run 'labops restart' or check 'labops logs'.")
		return false
	}

	fmt.Println("done.")
	fmt.Println("Opening http://localhost:3000 in your browser...")

	if err := OpenBrowser(frontendURL); err != nil {
		fmt.Println("Please open http://localhost:3000 manually.")
	}

	return true
}

// StartWSL2Mode boots LabOps using Docker inside the specified WSL2 distribution.
func StartWSL2Mode(distro string) bool {
	return StartNativeStack(distro)
}

// StartDockerMode boots LabOps using the local Docker Desktop / Docker Engine.
func StartDockerMode() bool {
	if !CheckDependency("docker") {
		if wslReady, distro := CheckWSLDockerReady(); wslReady {
			fmt.Printf("Host 'docker' CLI not found, but detected running inside WSL2 (%s).\n", distro)
			fmt.Println("Switching to Native WSL2 Mode...")
			return StartWSL2Mode(distro)
		}
		fmt.Println("Error: 'docker' CLI is not found in PATH.")
		fmt.Println("Please install Docker Desktop or ensure docker is in your PATH.")
		return false
	}

	if !IsDockerDaemonRunning() {
		if wslReady, distro := CheckWSLDockerReady(); wslReady {
			fmt.Printf("Docker daemon not running on Windows host, but detected running in WSL2 (%s).\n", distro)
			fmt.Println("Switching to Native WSL2 Mode...")
			return StartWSL2Mode(distro)
		}
		fmt.Println("Error: Docker daemon is not running.")
		fmt.Println("Please start Docker Desktop or start Docker inside WSL2 and try again.")
		return false
	}

	return StartNativeStack("")
}

// RunStart handles runtime selection, port checks, and environment bootstrap.
func RunStart() bool {
	// Ensure course content is present locally on the host
	cdnURL := GetContentCDNURL()
	localVer := ReadLocalContentVersion()
	if localVer == "" {
		_ = SyncCourseContent(cdnURL, false)
	} else {
		go func() {
			_ = SyncCourseContent(cdnURL, false)
		}()
	}

	wslReady, wslDistro := CheckWSLDockerReady()

	// Check for explicit CLI flags in arguments
	for _, arg := range os.Args[2:] {
		lower := strings.ToLower(arg)
		if lower == "--restart" || lower == "-r" {
			RunStop()
			break
		}
	}

	for _, arg := range os.Args[2:] {
		lower := strings.ToLower(arg)
		if lower == "--vm" || lower == "-v" || lower == "--vagrant" {
			fmt.Println("Notice: Vagrant/VM mode is currently disabled. Defaulting to Docker runtime.")
			break
		}
		if lower == "--docker" || lower == "-d" || lower == "--desktop" {
			return StartDockerMode()
		}
		if lower == "--wsl" || lower == "-w" {
			if wslReady {
				return StartWSL2Mode(wslDistro)
			}
			fmt.Println("Error: WSL2 with Docker is not ready.")
			return false
		}
	}

	// Default directly to native runtime without prompting
	if wslReady {
		return StartWSL2Mode(wslDistro)
	}

	return StartDockerMode()
}

// RunRestart stops any running services and performs a clean start.
func RunRestart() bool {
	RunStop()
	return RunStart()
}
