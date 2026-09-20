package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// RunStop stops any running LabOps containers and VMs.
func RunStop() bool {
	// If already stopped and not running, exit gracefully
	if !IsAlreadyHealthy() {
		// Clean up any dangling containers silently
		if IsDockerDaemonRunning() {
			if out, err := exec.Command("docker", "ps", "-a", "-q", "--filter", "name=labops-").Output(); err == nil && len(strings.TrimSpace(string(out))) > 0 {
				ids := strings.Fields(string(out))
				args := append([]string{"rm", "-f"}, ids...)
				_ = exec.Command("docker", args...).Run()
			}
		}
		fmt.Println("LabOps is not running.")
		return true
	}

	fmt.Print("Stopping LabOps... ")

	// 1. Stop Docker Compose stack silently
	composeDir, composeFile, err := FindComposeFile()
	if err == nil {
		if IsDockerDaemonRunning() {
			// Silently stop and remove dynamically spawned lab containers first so the network is not held in use
			if out, err := exec.Command("docker", "ps", "-a", "-q", "--filter", "name=labops-").Output(); err == nil && len(strings.TrimSpace(string(out))) > 0 {
				ids := strings.Fields(string(out))
				args := append([]string{"rm", "-f"}, ids...)
				_ = exec.Command("docker", args...).Run()
			}

			cmd := exec.Command("docker", "compose", "-f", composeFile, "down")
			cmd.Dir = composeDir
			_ = cmd.Run()
		}
		if wslReady, distro := CheckWSLDockerReady(); wslReady {
			wslDir := ToWSLPath(composeDir)
			cmd := exec.Command("wsl.exe", "-d", distro, "sh", "-c", fmt.Sprintf("docker ps -a -q --filter 'name=labops-' | xargs -r docker rm -f 2>/dev/null; cd '%s' && docker compose -f '%s' down", wslDir, composeFile))
			_ = cmd.Run()
		}
	}

	// 2. Stop Vagrant VM only if explicitly requested
	for _, arg := range os.Args[2:] {
		lower := strings.ToLower(arg)
		if lower == "--vm" || lower == "-v" || lower == "--vagrant" {
			if vDir, err := FindVagrantfileDir(); err == nil {
				cmd := exec.Command("vagrant", "halt")
				cmd.Dir = vDir
				_ = cmd.Run()
			}
			break
		}
	}

	fmt.Println("done.")
	return true
}
