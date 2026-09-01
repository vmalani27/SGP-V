package main

import (
	"fmt"
	"os"
	"os/exec"
)

// RunLogs pulls and displays logs from the VM services.
func RunLogs() bool {
	fmt.Println("Fetching LabOps Environment Logs...")
	fmt.Println("==================================================")

	dir, err := FindVagrantfileDir()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}

	// 1. Fetch Orchestrator Logs
	fmt.Println("\n1. Orchestrator Service Logs (systemd):")
	fmt.Println("--------------------------------------------------")
	orcCmd := exec.Command("vagrant", "ssh", "-c", "sudo journalctl -u labops-orchestrator -n 40 --no-pager")
	orcCmd.Dir = dir
	orcCmd.Stdout = os.Stdout
	orcCmd.Stderr = os.Stderr
	
	if err := orcCmd.Run(); err != nil {
		fmt.Printf("Warning: Could not fetch orchestrator logs (is the VM running?): %v\n", err)
	}

	// 2. Fetch Frontend Container Logs
	fmt.Println("\n2. Frontend Container Logs (docker):")
	fmt.Println("--------------------------------------------------")
	feCmd := exec.Command("vagrant", "ssh", "-c", "sudo docker logs --tail 40 labops-frontend")
	feCmd.Dir = dir
	feCmd.Stdout = os.Stdout
	feCmd.Stderr = os.Stderr
	
	if err := feCmd.Run(); err != nil {
		fmt.Printf("Warning: Could not fetch frontend container logs (is the VM/container running?): %v\n", err)
	}

	fmt.Println("==================================================")
	return true
}
