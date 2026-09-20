package main

import (
	"fmt"
	"os"
	"strings"
)

// PrintHelp displays CLI usage guidance.
func PrintHelp() {
	fmt.Println("LabOps — Interactive DevOps Learning Environment")
	fmt.Println("Usage: labops <command>")
	fmt.Println("\nCommands:")
	fmt.Println("  start     Start your learning workspace (opens in browser)")
	fmt.Println("  stop      Stop your learning workspace")
	fmt.Println("  restart   Restart your learning workspace")
	fmt.Println("  status    Check if your workspace is running")
	fmt.Println("  update    Download latest courses and lab materials")
	fmt.Println("  doctor    Check if your computer is ready to run LabOps")
	fmt.Println("  logs      Show troubleshooting logs")
	fmt.Println("  version   Show installed version of LabOps")
	fmt.Println("  help      Show this help menu")
	fmt.Println("\nQuick Start:")
	fmt.Println("  1. Check system:   labops doctor")
	fmt.Println("  2. Start learning: labops start")
	fmt.Println("  3. Stop when done: labops stop")
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
		fmt.Printf("Error: Unknown command: '%s'\n", command)
		PrintHelp()
		os.Exit(1)
	}

	if !success {
		os.Exit(1)
	}
	os.Exit(0)
}
