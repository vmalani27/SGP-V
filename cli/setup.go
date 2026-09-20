package main

import (
	"fmt"
	"path/filepath"
	"runtime"
)

// RunSetup manages configuring local environment dependencies and pre-pulling lab images.
func RunSetup() bool {
	fmt.Println("Setting up LabOps Native Environment...")
	fmt.Println("==================================================")

	// 1. Verify Platform Prerequisites
	switch runtime.GOOS {
	case "windows":
		fmt.Println("Target Platform: Windows (WSL2 Native Runtime)")
		sysd, distro, err := CheckWSL2Systemd()
		if err != nil || !sysd || distro == "" {
			fmt.Println("\n[Action Required] WSL2 Configuration:")
			fmt.Println("  1. Ensure WSL2 with Ubuntu is installed (e.g. 'wsl --install -d Ubuntu-22.04')")
			fmt.Println("  2. Ensure systemd is enabled by adding to /etc/wsl.conf:")
			fmt.Println("     [boot]")
			fmt.Println("     systemd=true")
			fmt.Println("  3. Restart WSL: 'wsl --shutdown'")
			return false
		}
		fmt.Printf("  - WSL2 Linux distribution: OK (%s)\n", distro)
		fmt.Println("  - Systemd enabled: OK")

		wslReady, _ := CheckWSLDockerReady()
		if !wslReady && !IsDockerDaemonRunning() {
			fmt.Printf("  - Docker Engine is not running in %s or on Windows host.\n", distro)
			fmt.Println("    Please ensure Docker is installed and running inside your WSL2 distro:")
			fmt.Printf("    wsl -d %s -u root systemctl start docker\n", distro)
			return false
		}
		fmt.Printf("  - Docker Engine: OK (WSL2: %s)\n", distro)

	case "linux":
		fmt.Println("Target Platform: Linux Native")
		if !CheckDependency("docker") {
			fmt.Println("Error: 'docker' CLI is not installed.")
			fmt.Println("Please install Docker: https://docs.docker.com/engine/install/")
			return false
		}
		if !IsDockerDaemonRunning() {
			fmt.Println("Error: Docker daemon is not running. Please start it with: sudo systemctl start docker")
			return false
		}
		fmt.Println("  - Docker Engine: OK")

	case "darwin":
		fmt.Println("Target Platform: macOS")
		if !CheckDependency("docker") {
			fmt.Println("Error: Docker Desktop is not installed.")
			fmt.Println("Please install Docker Desktop: https://www.docker.com/products/docker-desktop/")
			return false
		}
		if !IsDockerDaemonRunning() {
			fmt.Println("Error: Docker Desktop is not running. Please start Docker Desktop.")
			return false
		}
		fmt.Println("  - Docker Engine: OK")
	}

	// 2. Ensure state directory
	p, err := statePath()
	if err == nil {
		fmt.Printf("  - Configuration directory: OK (%s)\n", filepath.Dir(p))
	}

	fmt.Println("\n==================================================")
	fmt.Println("Local prerequisites verified!")
	fmt.Println("Downloading managed LabOps images...")
	fmt.Println("--------------------------------------------------")

	// 3. Pre-pull managed application and lab images
	if !RunUpdate() {
		fmt.Println("\nWarning: Image download encountered an issue. You can re-run 'labops update' later.")
	}

	fmt.Println("\n==================================================")
	fmt.Println("Setup complete! You can now launch LabOps with:")
	fmt.Println("   labops start")
	return true
}



