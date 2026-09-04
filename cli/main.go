package main

import (
	"fmt"
	"os"
	"strings"
)

// PrintHelp displays CLI usage guidance.
func PrintHelp() {
	fmt.Println("LabOps CLI — Zero-Dependency Bootstrap Tool")
	fmt.Println("Usage: labops <command> [options]")
	fmt.Println("\nAvailable Commands:")
	fmt.Println("  doctor    Runs hardware, virtualization, and prerequisite checks.")
	fmt.Println("  setup     Downloads necessary VM base boxes and installs local dependencies.")
	fmt.Println("  pull      Pulls all container images (services and labs) from GHCR.")
	fmt.Println("  start     Boots the Vagrant VM, awaits service initialization, and starts the UI.")
	fmt.Println("  stop      Safely suspends or powers off the underlying VM.")
	fmt.Println("  logs      Aggregates stdout/stderr from the VM orchestrator and frontend.")
	fmt.Println("  help      Displays this help menu.")
	fmt.Println("\nExample Workflow:")
	fmt.Println("  1. Verify system:    labops doctor")
	fmt.Println("  2. Pull images:      labops pull")
	fmt.Println("  3. Launch LabOps:    labops start")
	fmt.Println("  4. Stop when done:   labops stop")
	fmt.Println("==================================================")
}

func main() {
	if len(os.Args) < 2 {
		PrintHelp()
		os.Exit(1)
	}

	command := strings.ToLower(os.Args[1])
	var success bool

	switch command {
	case "doctor":
		success = RunDoctor()
	case "setup":
		success = RunSetup()
	case "pull":
		success = RunPull()
	case "start":
		success = RunStart()
	case "stop":
		success = RunStop()
	case "logs":
		success = RunLogs()
	case "help", "-h", "--help":
		PrintHelp()
		os.Exit(0)
	default:
		fmt.Printf("Error: Unknown command: '%s'\n", command)
		PrintHelp()
		os.Exit(1)
	}

	if !success {
		os.Exit(1)
	}
	os.Exit(0)
}
