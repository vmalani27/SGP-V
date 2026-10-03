package main

import (
	"fmt"
	"strings"
)

// RunStatus checks if LabOps services are running and prints clean status info.
func RunStatus() bool {
	wslReady, distro := CheckWSLDockerReady()
	wslDistro := ""
	if wslReady {
		wslDistro = distro
	} else if !IsDockerDaemonRunning() {
		fmt.Println("LabOps is not running (Docker daemon is inactive).")
		return false
	}

	services := []struct {
		Name  string
		Key   string
		Label string
	}{
		{Name: "labops-proxy", Key: "Web UI (Proxy)", Label: "http://localhost:3000"},
		{Name: "labops-frontend", Key: "Frontend", Label: ""},
		{Name: "labops-orchestrator", Key: "Orchestrator Engine", Label: ""},
		{Name: "labops-git-server", Key: "Git Server", Label: "http://localhost:3001"},
		{Name: "labops-content-sync", Key: "Content Sync", Label: ""},
	}

	fmt.Println("LabOps Stack Status:")
	fmt.Println("--------------------------------------------------")

	anyRunning := false
	for _, s := range services {
		out, _, err := RunDockerCmd(wslDistro, "inspect", "--format", "{{.State.Status}}", s.Name)
		statusStr := strings.TrimSpace(out)
		if err == nil && statusStr == "running" {
			anyRunning = true
			if s.Label != "" {
				fmt.Printf("  [OK]   %-22s %s (%s)\n", s.Key, s.Label, statusStr)
			} else {
				fmt.Printf("  [OK]   %-22s %s\n", s.Key, statusStr)
			}
		} else {
			fmt.Printf("  [STOP] %-22s Stopped\n", s.Key)
		}
	}

	fmt.Println("--------------------------------------------------")
	if anyRunning && IsAlreadyHealthy() {
		fmt.Println("LabOps is active at http://localhost:3000")
		return true
	}

	fmt.Println("LabOps is not active. Run 'labops start' to launch.")
	return false
}
