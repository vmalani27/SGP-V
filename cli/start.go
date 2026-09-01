package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// CheckPortAvailable checks if a local TCP port is free to bind.
func CheckPortAvailable(port int) bool {
	address := fmt.Sprintf("127.0.0.1:%d", port)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

// FindVagrantfileDir attempts to locate the directory containing the Vagrantfile.
func FindVagrantfileDir() (string, error) {
	// 1. Check current working directory
	if _, err := os.Stat("Vagrantfile"); err == nil {
		return ".", nil
	}

	// 2. Check binary directory
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		if _, err := os.Stat(filepath.Join(exeDir, "Vagrantfile")); err == nil {
			return exeDir, nil
		}
	}

	return "", fmt.Errorf("could not locate Vagrantfile in current directory or binary directory")
}

// OpenBrowser opens the default web browser to the specified URL.
func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		return fmt.Errorf("unsupported platform for open browser: %s", runtime.GOOS)
	}
	return cmd.Start()
}

// PollEndpoint pings an HTTP URL and returns true when it responds with 200 OK.
func PollEndpoint(url string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	client := http.Client{
		Timeout: 2 * time.Second,
	}

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return true
		}
		time.Sleep(2 * time.Second)
	}
	return false
}

// RunStart handles checking ports, booting the VM, and launching the portal.
func RunStart() bool {
	fmt.Println("Starting LabOps Environment...")
	fmt.Println("==================================================")

	// 1. Port checks
	fmt.Println("Checking local ports...")
	portsFree := true
	if !CheckPortAvailable(3000) {
		fmt.Println("Error: Port 3000 (Frontend) is already in use by another application.")
		portsFree = false
	} else {
		fmt.Println("  - Port 3000 (Frontend): Free")
	}

	if !CheckPortAvailable(8001) {
		fmt.Println("Error: Port 8001 (Orchestrator) is already in use by another application.")
		portsFree = false
	} else {
		fmt.Println("  - Port 8001 (Orchestrator): Free")
	}

	if !portsFree {
		fmt.Println("==================================================")
		fmt.Println("Warning: Port conflict detected! Please stop any services running on ports 3000 or 8001 and try again.")
		return false
	}

	// 2. Find Vagrantfile directory
	dir, err := FindVagrantfileDir()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}

	// 3. Boot VM
	fmt.Println("\nBooting Vagrant VM (this runs containers + orchestrator)...")
	cmd := exec.Command("vagrant", "up")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	if err := cmd.Run(); err != nil {
		fmt.Printf("Error: Failed to boot VM: %v\n", err)
		return false
	}

	// 4. Poll services
	fmt.Println("\nWaiting for LabOps services to initialize inside the VM...")
	
	orchestratorURL := "http://localhost:8001/health"
	frontendURL := "http://localhost:3000"

	fmt.Print("  - Checking Orchestrator API (port 8001)... ")
	if PollEndpoint(orchestratorURL, 90*time.Second) {
		fmt.Println("OK")
	} else {
		fmt.Println("FAILED (Timeout waiting for orchestrator)")
		return false
	}

	fmt.Print("  - Checking Frontend Portal (port 3000)... ")
	if PollEndpoint(frontendURL, 90*time.Second) {
		fmt.Println("OK")
	} else {
		fmt.Println("FAILED (Timeout waiting for frontend)")
		return false
	}

	fmt.Println("\n==================================================")
	fmt.Println("LabOps is running successfully!")
	fmt.Println("Opening browser to http://localhost:3000...")
	
	if err := OpenBrowser(frontendURL); err != nil {
		fmt.Printf("Warning: Could not automatically open browser: %v\n", err)
		fmt.Println("Please open http://localhost:3000 manually.")
	}

	return true
}
