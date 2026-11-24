package main

import (
	"os"
	"strings"
)

// PrintHelp displays CLI usage guidance.
func PrintHelp() {
	Println("LabOps — Interactive DevOps Learning Environment")
	Println("Usage: labops <command>")
	Println("\nCommands:")
	Println("  start     Start your learning workspace (opens in browser)")
	Println("  stop      Stop your learning workspace")
	Println("  restart   Restart your learning workspace")
	Println("  status    Check if your workspace is running")
	Println("  update    Download latest courses and lab materials")
	Println("  doctor    Check if your computer is ready to run LabOps")
	Println("  logs      Show troubleshooting logs")
	Println("  version   Show installed version of LabOps")
	Println("  help      Show this help menu")
	Println("\nQuick Start:")
	Println("  1. Check system:   labops doctor")
	Println("  2. Start learning: labops start")
	Println("  3. Stop when done: labops stop")
	Println("==================================================")
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
	case "restart":
		success = RunRestart()
	case "stop":
		success = RunStop()
	case "logs":
		success = RunLogs()
	case "status":
		success = RunStatus()
	case "help", "-h", "--help":
		PrintHelp()
		os.Exit(0)
	default:
		Printf("Error: Unknown command: '%s'\n", command)
		PrintHelp()
		os.Exit(1)
	}

	if !success {
		os.Exit(1)
	}
	os.Exit(0)
}
