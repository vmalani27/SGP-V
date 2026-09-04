package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// PrintInstallInstructions displays platform-specific commands for missing deps.
func PrintInstallInstructions(missingVagrant, missingHypervisor bool) {
	fmt.Println("\nInstallation Instructions:")
	fmt.Println("--------------------------------------------------")

	switch runtime.GOOS {
	case "windows":
		if missingHypervisor {
			fmt.Println("For VirtualBox (Hypervisor):")
			fmt.Println("   Option A (Command Line): Run this in Administrator PowerShell:")
			fmt.Println("     winget install Oracle.VirtualBox")
			fmt.Println("   Option B (Manual): Download and install from:")
			fmt.Println("     https://www.virtualbox.org/wiki/Downloads")
			fmt.Println()
		}
		if missingVagrant {
			fmt.Println("For Vagrant:")
			fmt.Println("   Option A (Command Line): Run this in Administrator PowerShell:")
			fmt.Println("     winget install HashiCorp.Vagrant")
			fmt.Println("   Option B (Manual): Download and install from:")
			fmt.Println("     https://developer.hashicorp.com/vagrant/downloads")
			fmt.Println()
		}
		fmt.Println("Note: You may need to RESTART your computer or command prompt after installing Vagrant so the PATH updates.")

	case "darwin":
		if missingHypervisor || missingVagrant {
			fmt.Println("Using Homebrew (recommended):")
		}
		if missingHypervisor {
			fmt.Println("   For VirtualBox:")
			fmt.Println("     brew install --cask virtualbox")
			fmt.Println("   For VMware Fusion (alternative):")
			fmt.Println("     brew install --cask vmware-fusion")
			fmt.Println()
		}
		if missingVagrant {
			fmt.Println("   For Vagrant:")
			fmt.Println("     brew install vagrant")
			fmt.Println()
		}

	case "linux":
		fmt.Println("Linux Package Manager installation:")
		if missingHypervisor {
			fmt.Println("   For Debian/Ubuntu:")
			fmt.Println("     sudo apt-get update && sudo apt-get install virtualbox")
			fmt.Println("   For RedHat/Fedora/CentOS:")
			fmt.Println("     sudo dnf install virtualbox")
			fmt.Println()
		}
		if missingVagrant {
			fmt.Println("   For Debian/Ubuntu:")
			fmt.Println("     sudo apt-get install vagrant")
			fmt.Println("   For RedHat/Fedora/CentOS:")
			fmt.Println("     sudo dnf install vagrant")
			fmt.Println()
		}

	default:
		fmt.Printf("Please install Vagrant and VirtualBox/VMware manually for your platform: %s\n", runtime.GOOS)
	}
	fmt.Println("--------------------------------------------------")
}

// RunSetup manages downloading dependencies and pre-pulling base boxes.
func RunSetup() bool {
	fmt.Println("Setting up LabOps Dependencies...")
	fmt.Println("==================================================")

	hasVagrant := CheckDependency("vagrant")
	hasVirtualBox, hasVMware := CheckHypervisorInstalled()

	hasHypervisor := hasVirtualBox || hasVMware

	if !hasVagrant || !hasHypervisor {
		fmt.Println("Error: Missing required dependencies:")
		if !hasVagrant {
			fmt.Println("  - Vagrant is NOT installed.")
		}
		if !hasHypervisor {
			fmt.Println("  - No supported hypervisor (VirtualBox or VMware) was detected.")
		}

		PrintInstallInstructions(!hasVagrant, !hasHypervisor)
		return false
	}

	fmt.Println("All software prerequisites (Vagrant + Hypervisor) are installed.")

	// Determine provider
	provider := "virtualbox"
	if hasVMware && !hasVirtualBox {
		provider = "vmware_desktop"
	}

	fmt.Printf("Pre-pulling Vagrant base box 'generic/ubuntu2204' (provider: %s)...\n", provider)
	fmt.Println("This download is ~600MB and may take a few minutes depending on your internet connection.")
	fmt.Println("Running: vagrant box add generic/ubuntu2204 --provider " + provider + " --clean")

	cmd := exec.Command("vagrant", "box", "add", "generic/ubuntu2204", "--provider", provider, "--clean")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	// Run and stream output
	if err := cmd.Run(); err != nil {
		// Box might already exist, check if it failed for that reason
		fmt.Printf("\nNote: If the box was already downloaded, this check can be skipped. Box add returned: %v\n", err)
	}

	fmt.Println("\n==================================================")
	fmt.Println("Setup complete! You can now start the environment with:")
	fmt.Println("   labops start")

	return true
}

// RunPull pulls all service and lab images from GHCR and tags them locally.
func RunPull() bool {
	fmt.Println("Pulling LabOps Container Images from GHCR...")
	fmt.Println("==================================================")

	if !CheckDependency("docker") {
		fmt.Println("Error: Docker is not installed or not in PATH.")
		return false
	}

	images := []struct {
		name   string
		remote string
		tags   []string
	}{
		{"Backend Service", "ghcr.io/vmalani27/sgp-v/backend:dev", nil},
		{"Frontend Service", "ghcr.io/vmalani27/sgp-v/frontend:dev", nil},
		{"Orchestrator Service", "ghcr.io/vmalani27/sgp-v/orchestrator:dev", nil},
		{"Base Ubuntu Lab", "ghcr.io/vmalani27/sgp-v/lab-ubuntu:dev", []string{"labops-ubuntu:latest", "sgp-lab-ubuntu:latest"}},
		{"Docker Lab", "ghcr.io/vmalani27/sgp-v/lab-docker:dev", []string{"labops-docker:latest", "sgp-lab-docker:latest"}},
		{"Docker Fundamentals Lab", "ghcr.io/vmalani27/sgp-v/lab-docker-fundamentals:dev", []string{"labops-docker-fundamentals:latest", "sgp-lab-docker-fundamentals:latest"}},
	}

	for i, img := range images {
		fmt.Printf("[%d/%d] Pulling %s (%s)...\n", i+1, len(images), img.name, img.remote)
		cmd := exec.Command("docker", "pull", img.remote)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Printf("Warning: Failed to pull %s: %v\n", img.remote, err)
		}

		for _, tag := range img.tags {
			tagCmd := exec.Command("docker", "tag", img.remote, tag)
			_ = tagCmd.Run()
		}
		fmt.Println()
	}

	fmt.Println("==================================================")
	fmt.Println("All available LabOps images are pulled and ready.")
	return true
}

