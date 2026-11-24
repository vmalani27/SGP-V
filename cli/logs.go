package main

import (
	"strings"
)

// RunLogs displays troubleshooting logs from active LabOps containers.
func RunLogs() bool {
	wslDistro := ""
	if !IsDockerDaemonRunning() {
		wslReady, distro := CheckWSLDockerReady()
		if wslReady {
			wslDistro = distro
		}
	}

	containers := []string{"labops-proxy", "labops-frontend", "labops-orchestrator", "labops-git-server", "labops-content-sync"}
	foundLogs := false

	Println("LabOps Service Logs (last 40 lines per container)")
	Println("==================================================")

	for _, c := range containers {
		out, stderr, err := RunDockerCmd(wslDistro, "logs", "--tail", "40", c)
		if err == nil && (len(out) > 0 || len(stderr) > 0) {
			foundLogs = true
			Printf("\n--- Container: %s ---\n", c)
			if len(out) > 0 {
				Println(out)
			}
			if len(stderr) > 0 && !strings.Contains(stderr, "No such container") {
				Println(stderr)
			}
		}
	}

	if !foundLogs {
		Println("No active LabOps logs were found.")
	}
	Println("==================================================")
	return true
}
