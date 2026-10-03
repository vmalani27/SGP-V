package main

import (
	"fmt"
	"strings"
)

// RunLogs displays troubleshooting logs from active LabOps containers.
func RunLogs() bool {
	wslReady, distro := CheckWSLDockerReady()
	wslDistro := ""
	if wslReady {
		wslDistro = distro
	}

	containers := []string{"labops-proxy", "labops-frontend", "labops-orchestrator", "labops-git-server", "labops-content-sync"}
	foundLogs := false

	fmt.Println("LabOps Service Logs (last 40 lines per container)")
	fmt.Println("==================================================")

	for _, c := range containers {
		out, stderr, err := RunDockerCmd(wslDistro, "logs", "--tail", "40", c)
		if err == nil && (len(out) > 0 || len(stderr) > 0) {
			foundLogs = true
			fmt.Printf("\n--- Container: %s ---\n", c)
			if len(out) > 0 {
				fmt.Println(out)
			}
			if len(stderr) > 0 && !strings.Contains(stderr, "No such container") {
				fmt.Println(stderr)
			}
		}
	}

	if !foundLogs {
		fmt.Println("No active LabOps logs were found.")
	}
	fmt.Println("==================================================")
	return true
}
