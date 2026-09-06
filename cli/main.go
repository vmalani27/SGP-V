package main

import (
	"fmt"
	"os"
	"strings"
)

// PrintHelp displays CLI usage guidance.
func PrintHelp() {
	fmt.Println("LabOps CLI — Local Learning Environment")
	fmt.Println("Usage: labops <command> [options]")
	fmt.Println("\nAvailable Commands:")
	fmt.Println("  doctor    Runs hardware, Docker, and hypervisor prerequisite checks.")
	fmt.Println("  setup     Installs local dependencies and prepares the environment.")
	fmt.Println("  update    Installs or updates the LabOps application and lab images.")
	fmt.Println("  start     Starts the installed LabOps environment.")
	fmt.Println("            Flags: --docker (-d) for Docker Desktop, --vm (-v) for Vagrant VM")
	fmt.Println("  stop      Stops running LabOps containers and/or Vagrant VM.")
	fmt.Println("  logs      Displays stdout/stderr logs from active services.")
	fmt.Println("  version   Displays the installed LabOps release state.")
	fmt.Println("  help      Displays this help menu.")
	fmt.Println("\nExample Workflow:")
	fmt.Println("  1. Verify system:    labops doctor")
	fmt.Println("  2. Install/update:   labops setup && labops update")
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
	case "update":
		success = RunUpdate()
	case "version":
		success = RunVersion()
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
