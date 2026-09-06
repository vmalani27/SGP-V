package main

import (
	"fmt"
	"os"
	"os/exec"
)

// RunLogs pulls and displays logs from Docker Compose or Vagrant VM services.
func RunLogs() bool {
	fmt.Println("Fetching LabOps Environment Logs...")
	fmt.Println("==================================================")
	foundLogs := false

	// 1. Check Docker Compose
	composeDir, composeFile, err := FindComposeFile()
	if err == nil {
		fmt.Printf("Docker Compose Logs (%s):\n", composeFile)
		fmt.Println("--------------------------------------------------")
		if IsDockerDaemonRunning() {
			cmd := exec.Command("docker", "compose", "-f", composeFile, "logs", "--tail", "40")
			cmd.Dir = composeDir
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err == nil {
				foundLogs = true
			}
		} else if wslReady, distro := CheckWSLDockerReady(); wslReady {
			wslDir := ToWSLPath(composeDir)
			cmd := exec.Command("wsl.exe", "-d", distro, "sh", "-c", fmt.Sprintf("cd '%s' && docker compose -f '%s' logs --tail 40", wslDir, composeFile))
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err == nil {
				foundLogs = true
			}
		}
	}

	// 2. Check Vagrant VM
	vDir, err := FindVagrantfileDir()
	if err == nil {
		fmt.Println("\nVagrant VM Orchestrator Service Logs (systemd):")
		fmt.Println("--------------------------------------------------")
		orcCmd := exec.Command("vagrant", "ssh", "-c", "sudo journalctl -u labops-orchestrator -n 40 --no-pager")
		orcCmd.Dir = vDir
		orcCmd.Stdout = os.Stdout
		orcCmd.Stderr = os.Stderr
		if err := orcCmd.Run(); err == nil {
			foundLogs = true
		}
	}

	if !foundLogs {
		fmt.Println("No active LabOps logs were found.")
	}
	fmt.Println("==================================================")
	return true
}
