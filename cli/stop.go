package main

import (
	"fmt"
	"os"
	"os/exec"
)

// RunStop stops any running LabOps containers and VMs.
func RunStop() bool {
	fmt.Println("Stopping LabOps Environment...")
	fmt.Println("==================================================")
	stoppedSomething := false

	// 1. Check & stop Docker Compose stack if present
	composeDir, composeFile, err := FindComposeFile()
	if err == nil {
		fmt.Printf("Stopping Docker Compose stack (%s)...\n", composeFile)
		if IsDockerDaemonRunning() {
			cmd := exec.Command("docker", "compose", "-f", composeFile, "down")
			cmd.Dir = composeDir
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err == nil {
				stoppedSomething = true
				fmt.Println("  - Docker Compose services stopped.")
			}
		}
		if wslReady, distro := CheckWSLDockerReady(); wslReady {
			wslDir := ToWSLPath(composeDir)
			cmd := exec.Command("wsl.exe", "-d", distro, "sh", "-c", fmt.Sprintf("cd '%s' && docker compose -f '%s' down", wslDir, composeFile))
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err == nil {
				stoppedSomething = true
				fmt.Printf("  - Docker Compose services stopped (WSL2: %s).\n", distro)
			}
		}
	}

	// 2. Check & stop Vagrant VM if present
	vDir, err := FindVagrantfileDir()
	if err == nil {
		fmt.Println("Powering off Vagrant VM (if running)...")
		cmd := exec.Command("vagrant", "halt")
		cmd.Dir = vDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err == nil {
			stoppedSomething = true
			fmt.Println("  - Vagrant VM powered off.")
		}
	}

	fmt.Println("==================================================")
	if stoppedSomething {
		fmt.Println("LabOps services successfully stopped.")
	} else {
		fmt.Println("No active LabOps services were detected.")
	}
	return true
}
