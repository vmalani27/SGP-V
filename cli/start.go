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

// FindVagrantfileDir attempts to locate the directory containing the Vagrantfile.
func FindVagrantfileDir() (string, error) {
	// 1. Check current working directory and the repository's vagrant directory.
	for _, candidate := range []string{"Vagrantfile", filepath.Join("vagrant", "Vagrantfile")} {
		if _, err := os.Stat(candidate); err == nil {
			return filepath.Dir(candidate), nil
		}
	}

	// 2. Check binary directory
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		for _, candidate := range []string{
			filepath.Join(exeDir, "Vagrantfile"),
			filepath.Join(exeDir, "vagrant", "Vagrantfile"),
			filepath.Join(exeDir, "..", "Vagrantfile"),
			filepath.Join(exeDir, "..", "vagrant", "Vagrantfile"),
		} {
			if _, err := os.Stat(candidate); err == nil {
				return filepath.Dir(candidate), nil
			}
		}
	}

	return "", fmt.Errorf("could not locate Vagrantfile in current directory or binary directory")
}

// FindComposeFile attempts to locate a docker-compose file.
func FindComposeFile() (string, string, error) {
	candidates := []string{
		"docker-compose.yml",
		"docker-compose.dev.yml",
		"docker-compose.local.yml",
	}

	// 1. Check current working directory
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return ".", c, nil
		}
	}

	// 2. Check binary directory and parent
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		for _, c := range candidates {
			if _, err := os.Stat(filepath.Join(exeDir, c)); err == nil {
				return exeDir, c, nil
			}
			if _, err := os.Stat(filepath.Join(exeDir, "..", c)); err == nil {
				return filepath.Join(exeDir, ".."), c, nil
			}
		}
	}

	return "", "", fmt.Errorf("could not locate docker-compose file (docker-compose.yml, docker-compose.dev.yml, or docker-compose.local.yml)")
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
	cmd := exec.Command("wsl.exe", "-d", distro, "docker", "info")
	if cmd.Run() == nil {
		return true, distro
	}
	return false, ""
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

// StartWSL2Mode boots LabOps using Docker inside the specified WSL2 distribution.
func StartWSL2Mode(distro string) bool {
	fmt.Printf("\nStarting LabOps in Native WSL2 Mode (%s)...\n", distro)
	fmt.Println("--------------------------------------------------")

	// 1. Find Compose file
	dir, composeFile, err := FindComposeFile()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}

	// Fast-path: if workspace is already running and healthy
	if IsAlreadyHealthy() {
		fmt.Println("LabOps is already running at http://localhost:3000")
		_ = OpenBrowser("http://localhost:3000")
		return true
	}

	wslDir := ToWSLPath(dir)

	fmt.Print("Starting LabOps... ")
	cmd := exec.Command("wsl.exe", "-d", distro, "sh", "-c", fmt.Sprintf("cd '%s' && CONTAINER_RUNTIME_MODE=sysbox docker compose -f '%s' up -d --remove-orphans", wslDir, composeFile))
	var outBuf bytes.Buffer
	var errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	if err := cmd.Run(); err != nil {
		fmt.Println("FAILED")
		errStr := strings.ToLower(errBuf.String())
		if strings.Contains(errStr, "port is already allocated") || strings.Contains(errStr, "address already in use") {
			fmt.Println("\nError: Port 3000 is already in use by another application on your machine.")
			fmt.Println("Please close the conflicting application or run 'labops stop' to reset stale containers.")
		} else {
			fmt.Printf("\nError: Failed to launch LabOps: %v\n", err)
		}
		return false
	}

	// Poll services until healthy
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

// StartDockerMode boots LabOps using the local Docker Desktop / Docker Engine.
func StartDockerMode() bool {
	fmt.Println("\nStarting LabOps in Docker Desktop / Local Mode...")
	fmt.Println("--------------------------------------------------")

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

	// 1. Find Compose file
	dir, composeFile, err := FindComposeFile()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}
	// Fast-path: if workspace is already running and healthy
	if IsAlreadyHealthy() {
		fmt.Println("LabOps is already running at http://localhost:3000")
		_ = OpenBrowser("http://localhost:3000")
		return true
	}

	fmt.Print("Starting LabOps... ")
	cmd := exec.Command("docker", "compose", "-f", composeFile, "up", "-d", "--remove-orphans")
	cmd.Dir = dir
	var outBuf bytes.Buffer
	var errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	if err := cmd.Run(); err != nil {
		fmt.Println("FAILED")
		errStr := strings.ToLower(errBuf.String())
		if strings.Contains(errStr, "port is already allocated") || strings.Contains(errStr, "address already in use") {
			fmt.Println("\nError: Port 3000 is already in use by another application on your machine.")
			fmt.Println("Please close the conflicting application or run 'labops stop' to reset stale containers.")
		} else {
			fmt.Printf("\nError: Failed to launch LabOps: %v\n", err)
		}
		return false
	}

	// Poll services until healthy
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

// StartVagrantMode boots LabOps using the Vagrant Sysbox VM.
func StartVagrantMode() bool {
	fmt.Println("\nStarting LabOps in Vagrant VM Mode...")
	fmt.Println("--------------------------------------------------")

	// 1. Port checks
	fmt.Println("Checking local ports...")
	portsFree := true
	if !CheckPortAvailable(3000) {
		fmt.Println("  - Port 3000 (Frontend): Already in use!")
		portsFree = false
	} else {
		fmt.Println("  - Port 3000 (Frontend): Free")
	}

	if !CheckPortAvailable(8001) {
		fmt.Println("  - Port 8001 (Orchestrator): Already in use!")
		portsFree = false
	} else {
		fmt.Println("  - Port 8001 (Orchestrator): Free")
	}

	if !portsFree {
		fmt.Println("\nWarning: Port conflict detected! Please stop conflicting services or run 'labops stop'.")
		return false
	}

	// 2. Find Vagrantfile directory
	dir, err := FindVagrantfileDir()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}

	// 3. Boot VM
	fmt.Println("\nBooting Vagrant VM (Sysbox container runtime)...")
	cmd := exec.Command("vagrant", "up")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		fmt.Printf("Error: Failed to boot VM: %v\n", err)
		return false
	}

	// 4. Poll services
	fmt.Println("\nWaiting for LabOps services to initialize inside the VM...")

	frontendURL := "http://localhost:3000"

	fmt.Print("  - Checking Orchestrator API (Gateway /health or :8001)... ")
	if PollOrchestratorEndpoint(90 * time.Second) {
		fmt.Println("OK")
	} else {
		fmt.Println("FAILED (Timeout waiting for orchestrator)")
		return false
	}

	fmt.Print("  - Checking Frontend Portal (port 3000)... ")
	if PollEndpoint(frontendURL, 90*time.Second) {
		fmt.Println("OK")
	} else {
		fmt.Println("FAILED (Timeout waiting for frontend)")
		return false
	}

	fmt.Println("\n==================================================")
	fmt.Println("LabOps is running successfully inside the Vagrant VM!")
	fmt.Println("Opening browser to http://localhost:3000...")

	if err := OpenBrowser(frontendURL); err != nil {
		fmt.Printf("Warning: Could not automatically open browser: %v\n", err)
		fmt.Println("Please open http://localhost:3000 manually.")
	}

	return true
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
			return StartVagrantMode()
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
