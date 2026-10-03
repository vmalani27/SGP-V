package main

import (
	"fmt"
	"os"
	"os/exec"
)

// RunLogs displays troubleshooting logs from the workspace.
func RunLogs() bool {
	foundLogs := false

	// 1. Check workspace logs
	composeDir, composeFile, err := FindComposeFile()
	if err == nil {
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

	// TODO: VM log fetching (e.g. Vagrant / QEMU) can be re-added here during CLI refactoring if needed.

	if !foundLogs {
		fmt.Println("No active LabOps logs were found.")
	}
	fmt.Println("==================================================")
	return true
}
