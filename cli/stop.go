package main

import (
	"fmt"
	"strings"
)

// RunStop stops any running LabOps containers and networks natively.
func RunStop() bool {
	wslReady, distro := CheckWSLDockerReady()
	wslDistro := ""
	if wslReady {
		wslDistro = distro
	}

	// Stop Docker stack on host and/or WSL2
	hasContainers := false

	// Check if any containers exist on host
	if IsDockerDaemonRunning() {
		if out, _, err := RunDockerCmd("", "ps", "-a", "-q", "--filter", "name=labops-"); err == nil && len(out) > 0 {
			hasContainers = true
		}
	}
	// Check if any containers exist in WSL2
	if wslDistro != "" {
		if out, _, err := RunDockerCmd(wslDistro, "ps", "-a", "-q", "--filter", "name=labops-"); err == nil && len(out) > 0 {
			hasContainers = true
		}
	}

	if !hasContainers && !IsAlreadyHealthy() {
		fmt.Println("LabOps is not running.")
		return true
	}

	fmt.Print("Stopping LabOps... ")

	stackContainers := []string{"labops-proxy", "labops-frontend", "labops-orchestrator", "labops-git-server", "labops-content-sync"}

	if IsDockerDaemonRunning() {
		// Stop dynamic lab containers
		if out, _, err := RunDockerCmd("", "ps", "-a", "-q", "--filter", "name=labops-"); err == nil && len(out) > 0 {
			ids := strings.Fields(out)
			args := append([]string{"rm", "-f"}, ids...)
			_, _, _ = RunDockerCmd("", args...)
		} else {
			args := append([]string{"rm", "-f"}, stackContainers...)
			_, _, _ = RunDockerCmd("", args...)
		}
		_, _, _ = RunDockerCmd("", "network", "rm", "labops-net")
	}

	if wslDistro != "" {
		if out, _, err := RunDockerCmd(wslDistro, "ps", "-a", "-q", "--filter", "name=labops-"); err == nil && len(out) > 0 {
			ids := strings.Fields(out)
			args := append([]string{"rm", "-f"}, ids...)
			_, _, _ = RunDockerCmd(wslDistro, args...)
		} else {
			args := append([]string{"rm", "-f"}, stackContainers...)
			_, _, _ = RunDockerCmd(wslDistro, args...)
		}
		_, _, _ = RunDockerCmd(wslDistro, "network", "rm", "labops-net")
	}

	fmt.Println("done.")
	return true
}
