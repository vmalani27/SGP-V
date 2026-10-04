package main

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
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
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", "info")
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

// CheckWSL2Available checks if a WSL2 Linux distribution with systemd is available.
func CheckWSL2Available() (bool, string) {
	if runtime.GOOS != "windows" {
		return false, ""
	}
	sysd, distro, err := CheckWSL2Systemd()
	if err != nil || !sysd || distro == "" || distro == "native" {
		return false, ""
	}
	return true, distro
}

// CheckWSLDockerReady checks if a WSL2 Linux distribution with systemd and Docker is available.
func CheckWSLDockerReady() (bool, string) {
	ok, distro := CheckWSL2Available()
	if !ok {
		return false, ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "wsl.exe", "-d", distro, "docker", "info")
	if cmd.Run() == nil {
		return true, distro
	}
	return false, distro
}

// EnsureWSL2Provisioned verifies that Docker CE daemon (dockerd) and Sysbox are installed inside the WSL2 distro.
// If either component is missing, it automatically provisions the WSL2 environment using root privileges.
func EnsureWSL2Provisioned(wslDistro string) bool {
	if wslDistro == "" || wslDistro == "native" {
		return true
	}

	// Fast check: verify if native dockerd, docker CLI, and sysbox-runc binaries exist inside WSL2
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmdCheck := exec.CommandContext(ctx, "wsl.exe", "-d", wslDistro, "sh", "-c", "[ -x /usr/bin/dockerd ] && [ -x /usr/bin/docker ] && [ -f /usr/bin/sysbox-runc ]")
	if cmdCheck.Run() == nil {
		return true
	}

	fmt.Printf("\n[Bootstrap] Auto-provisioning WSL2 (%s) with Docker CE & Sysbox runtime...\n", wslDistro)
	fmt.Println("This initial setup may take 1-2 minutes. Please wait...")

	script := `set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "nameserver 1.1.1.1" >> /etc/resolv.conf || true
echo "nameserver 8.8.8.8" >> /etc/resolv.conf || true

apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release jq apt-transport-https rsync kmod

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes --batch -o /etc/apt/keyrings/docker.gpg
UBUNTU_RELEASE=$(lsb_release -cs 2>/dev/null || echo "jammy")
if [ "$UBUNTU_RELEASE" != "jammy" ] && [ "$UBUNTU_RELEASE" != "focal" ]; then
  UBUNTU_RELEASE="jammy"
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${UBUNTU_RELEASE} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y

if [ ! -x /usr/bin/dockerd ] || [ ! -x /usr/bin/docker ]; then
  echo "Installing Docker CE Engine & CLI..."
  apt-mark unhold docker-ce docker-ce-cli containerd.io 2>/dev/null || true
  apt-get install --reinstall -y docker-ce=5:27.5.1-1~ubuntu.22.04~jammy docker-ce-cli=5:27.5.1-1~ubuntu.22.04~jammy containerd.io=1.7.29-1~ubuntu.22.04~jammy docker-buildx-plugin docker-compose-plugin || apt-get install --reinstall -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  apt-mark hold docker-ce docker-ce-cli containerd.io || true
fi

if [ ! -f /usr/bin/sysbox-runc ]; then
  echo "Installing Sysbox CE runtime..."
  SYSBOX_VERSION="0.7.0"
  SYSBOX_URL="https://github.com/nestybox/sysbox/releases/download/v${SYSBOX_VERSION}/sysbox-ce_${SYSBOX_VERSION}.linux_amd64.deb"
  curl -fsSL -o /tmp/sysbox-ce.deb "$SYSBOX_URL"
  systemctl stop docker docker.socket 2>/dev/null || service docker stop 2>/dev/null || true
  apt-get install -y /tmp/sysbox-ce.deb
  rm -f /tmp/sysbox-ce.deb
  mkdir -p /etc/docker
  cat <<'EOF' > /etc/docker/daemon.json
{
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
EOF
fi

systemctl daemon-reload 2>/dev/null || true
systemctl enable --now sysbox 2>/dev/null || service sysbox start 2>/dev/null || true
systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
`

	cleanScript := strings.ReplaceAll(script, "\r\n", "\n")
	cmd := exec.Command("wsl.exe", "-d", wslDistro, "-u", "root", "bash")
	cmd.Stdin = strings.NewReader(cleanScript)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		fmt.Printf("Warning: WSL2 auto-bootstrap encountered an issue: %v\n", err)
		return false
	}

	fmt.Println("WSL2 environment auto-provisioned successfully!")
	return true
}

// EnsureNativeLinuxProvisioned verifies and auto-provisions Docker CE & Sysbox CE on Native Linux if needed.
func EnsureNativeLinuxProvisioned() bool {
	if runtime.GOOS != "linux" {
		return true
	}

	// 1. Try starting existing docker daemon first
	ctx1, cancel1 := context.WithTimeout(context.Background(), 5*time.Second)
	_ = exec.CommandContext(ctx1, "systemctl", "start", "docker").Run()
	cancel1()

	ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	_ = exec.CommandContext(ctx2, "service", "docker", "start").Run()
	cancel2()

	// Fast check: verify if native dockerd, docker CLI, and sysbox-runc exist inside Linux
	cmdCheck := exec.Command("sh", "-c", "[ -x /usr/bin/dockerd ] && [ -x /usr/bin/docker ] && [ -f /usr/bin/sysbox-runc ]")
	if cmdCheck.Run() == nil {
		return true
	}

	fmt.Println("\n[Bootstrap] Auto-provisioning Native Linux with Docker CE & Sysbox runtime...")
	fmt.Println("This initial setup may take 1-2 minutes. Please wait...")

	script := `set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

$SUDO apt-get update -y || true
$SUDO apt-get install -y ca-certificates curl gnupg lsb-release jq apt-transport-https rsync kmod || true

$SUDO install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor --yes --batch -o /etc/apt/keyrings/docker.gpg || true
UBUNTU_RELEASE=$(lsb_release -cs 2>/dev/null || echo "jammy")
if [ "$UBUNTU_RELEASE" != "jammy" ] && [ "$UBUNTU_RELEASE" != "focal" ]; then
  UBUNTU_RELEASE="jammy"
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${UBUNTU_RELEASE} stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
$SUDO apt-get update -y || true

if [ ! -x /usr/bin/dockerd ] || [ ! -x /usr/bin/docker ]; then
  echo "Installing Docker CE Engine & CLI..."
  $SUDO apt-mark unhold docker-ce docker-ce-cli containerd.io 2>/dev/null || true
  $SUDO apt-get install --reinstall -y docker-ce=5:27.5.1-1~ubuntu.22.04~jammy docker-ce-cli=5:27.5.1-1~ubuntu.22.04~jammy containerd.io=1.7.29-1~ubuntu.22.04~jammy docker-buildx-plugin docker-compose-plugin || $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  $SUDO apt-mark hold docker-ce docker-ce-cli containerd.io || true
fi

if [ ! -f /usr/bin/sysbox-runc ]; then
  echo "Installing Sysbox CE runtime..."
  SYSBOX_VERSION="0.7.0"
  SYSBOX_URL="https://github.com/nestybox/sysbox/releases/download/v${SYSBOX_VERSION}/sysbox-ce_${SYSBOX_VERSION}.linux_amd64.deb"
  curl -fsSL -o /tmp/sysbox-ce.deb "$SYSBOX_URL"
  $SUDO systemctl stop docker docker.socket 2>/dev/null || $SUDO service docker stop 2>/dev/null || true
  $SUDO apt-get install -y /tmp/sysbox-ce.deb
  rm -f /tmp/sysbox-ce.deb
  $SUDO mkdir -p /etc/docker
  cat <<'EOF' | $SUDO tee /etc/docker/daemon.json >/dev/null
{
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
EOF
fi

$SUDO systemctl daemon-reload 2>/dev/null || true
$SUDO systemctl enable --now sysbox 2>/dev/null || $SUDO service sysbox start 2>/dev/null || true
$SUDO systemctl enable --now docker 2>/dev/null || $SUDO service docker start 2>/dev/null || true
`

	cleanScript := strings.ReplaceAll(script, "\r\n", "\n")
	cmd := exec.Command("bash", "-c", cleanScript)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		fmt.Printf("Warning: Native Linux auto-bootstrap encountered an issue: %v\n", err)
		return false
	}

	fmt.Println("Native Linux environment auto-provisioned successfully!")
	return true
}

// EnsureDockerReady ensures that the target Docker engine (host or WSL2) is active and ready to process commands.
func EnsureDockerReady(wslDistro string) bool {
	if _, _, err := RunDockerCmd(wslDistro, "info"); err == nil {
		if wslDistro != "" && wslDistro != "native" {
			EnsureWSL2Provisioned(wslDistro)
		} else if runtime.GOOS == "linux" {
			EnsureNativeLinuxProvisioned()
		}
		return true
	}

	if wslDistro != "" && wslDistro != "native" {
		EnsureWSL2Provisioned(wslDistro)

		ctx1, cancel1 := context.WithTimeout(context.Background(), 5*time.Second)
		_ = exec.CommandContext(ctx1, "wsl.exe", "-d", wslDistro, "-u", "root", "service", "docker", "start").Run()
		cancel1()

		ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
		_ = exec.CommandContext(ctx2, "wsl.exe", "-d", wslDistro, "-u", "root", "systemctl", "start", "docker").Run()
		cancel2()
	} else if runtime.GOOS == "linux" {
		EnsureNativeLinuxProvisioned()

		ctx1, cancel1 := context.WithTimeout(context.Background(), 5*time.Second)
		_ = exec.CommandContext(ctx1, "systemctl", "start", "docker").Run()
		cancel1()

		ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
		_ = exec.CommandContext(ctx2, "service", "docker", "start").Run()
		cancel2()
	}

	deadline := time.Now().Add(15 * time.Second)
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

// EnsureImagePresent checks if a Docker image is cached locally. If missing, it pulls the image.
// If silent is true, output is suppressed so background pre-warming does not interfere with the user's terminal.
func EnsureImagePresent(wslDistro string, imageName string, silent bool, tags ...string) {
	_, _, inspectErr := RunDockerCmd(wslDistro, "image", "inspect", imageName)
	if inspectErr != nil {
		if !silent {
			fmt.Printf("\n  -> Pre-fetching image (%s)...\n", imageName)
		}
		var cmd *exec.Cmd
		if wslDistro != "" && wslDistro != "native" {
			cmd = exec.Command("wsl.exe", "-d", wslDistro, "docker", "pull", imageName)
		} else {
			cmd = exec.Command("docker", "pull", imageName)
		}
		if !silent {
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
		}
		_ = cmd.Run()
	}

	for _, tag := range tags {
		if tag == "" {
			continue
		}
		_, _, tagErr := RunDockerCmd(wslDistro, "image", "inspect", tag)
		if tagErr != nil {
			if !silent {
				fmt.Printf("  -> Tagging %s as %s...\n", imageName, tag)
			}
			_, _, _ = RunDockerCmd(wslDistro, "image", "tag", imageName, tag)
		}
	}
}

// categorizeImages splits managed images into core application stack images vs course lab environment images.
func categorizeImages(channel string) (stack []managedImage, lab []managedImage, err error) {
	all, err := GetManagedImages(channel)
	if err != nil {
		return nil, nil, err
	}
	for _, img := range all {
		if len(img.Tags) > 0 {
			lab = append(lab, img)
		} else {
			stack = append(stack, img)
		}
	}
	return stack, lab, nil
}

// PreloadImagesParallel pulls and tags images concurrently using goroutines.
func PreloadImagesParallel(wslDistro string, images []managedImage, silent bool) {
	var wg sync.WaitGroup
	for _, img := range images {
		wg.Add(1)
		go func(m managedImage) {
			defer wg.Done()
			EnsureImagePresent(wslDistro, m.Remote, silent, m.Tags...)
		}(img)
	}
	wg.Wait()
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

	gitImage := reg + "/labops-git-server:latest"
	syncImage := reg + "/labops-content-sync:" + chanName
	orchImage := reg + "/labops-orchestrator:" + chanName
	feImage := reg + "/labops-frontend:" + chanName
	proxyImage := reg + "/labops-proxy:" + chanName

	stackImages, labImages, mErr := categorizeImages(chanName)
	if mErr != nil {
		// If CDN manifest cannot be fetched (e.g. offline or no manifest published), resolve channel defaults
		all := labOpsImages(chanName)
		for _, img := range all {
			if len(img.Tags) > 0 {
				labImages = append(labImages, img)
			} else {
				stackImages = append(stackImages, img)
			}
		}
	}

	// [Phase 1] Pre-fetch core control-plane stack images concurrently for ultra-fast startup
	PreloadImagesParallel(wslDistro, stackImages, false)

	// [Phase 2] Pre-warm course lab environment images in background so onboarding is instant
	go PreloadImagesParallel(wslDistro, labImages, true)

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
	gitImage = reg + "/labops-git-server:latest"
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
	syncImage = reg + "/labops-content-sync:" + chanName
	syncCmd := []string{
		"run", "-d",
		"--name", "labops-content-sync",
		"--net", "labops-net",
		"--net-alias", "content-sync",
		"--restart", "unless-stopped",
		"-v", contentVol + ":/content:rw",
		"-e", "CDN_URL=" + cdnURL,
		"-e", "LABOPS_CHANNEL=" + chanName,
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
	orchImage = reg + "/labops-orchestrator:" + chanName
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
	feImage = reg + "/labops-frontend:" + chanName
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
	proxyImage = reg + "/labops-proxy:" + chanName
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
		if wslAvailable, distro := CheckWSL2Available(); wslAvailable {
			fmt.Printf("Host 'docker' CLI not found, but detected WSL2 (%s).\n", distro)
			fmt.Println("Switching to Native WSL2 Mode...")
			return StartWSL2Mode(distro)
		}
		if runtime.GOOS == "linux" {
			fmt.Println("Host 'docker' CLI not found. Attempting Native Linux auto-provisioning...")
			if EnsureNativeLinuxProvisioned() && EnsureDockerReady("") {
				return StartNativeStack("")
			}
			fmt.Println("Error: 'docker' CLI is not found in PATH.")
			fmt.Println("Please install Docker CE or run 'sudo apt-get install docker-ce docker-ce-cli'.")
			return false
		}
		fmt.Println("Error: 'docker' CLI is not found in PATH.")
		fmt.Println("Please install Docker Desktop or ensure docker is in your PATH.")
		return false
	}

	if !IsDockerDaemonRunning() {
		if wslAvailable, distro := CheckWSL2Available(); wslAvailable {
			fmt.Printf("Docker daemon not running on Windows host, but detected WSL2 (%s).\n", distro)
			fmt.Println("Switching to Native WSL2 Mode...")
			return StartWSL2Mode(distro)
		}
		if runtime.GOOS == "linux" {
			fmt.Println("Docker daemon not running. Attempting to start daemon / auto-provision...")
			if EnsureNativeLinuxProvisioned() && EnsureDockerReady("") {
				return StartNativeStack("")
			}
			fmt.Println("Error: Docker daemon is not running.")
			fmt.Println("Please start Docker daemon with 'sudo systemctl start docker' or run labops as root.")
			return false
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

	wslAvailable, wslDistro := CheckWSL2Available()

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
			if wslAvailable {
				return StartWSL2Mode(wslDistro)
			}
			fmt.Println("Error: WSL2 with systemd is not ready.")
			return false
		}
	}

	// Default directly to native runtime without prompting
	if wslAvailable {
		return StartWSL2Mode(wslDistro)
	}

	return StartDockerMode()
}

// RunRestart stops any running services and performs a clean start.
func RunRestart() bool {
	RunStop()
	return RunStart()
}
