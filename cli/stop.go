package main

import (
	"fmt"
	"os"
	"os/exec"
)

// RunStop stops the VM by running vagrant halt.
func RunStop() bool {
	fmt.Println("Stopping LabOps Environment...")
	fmt.Println("==================================================")

	dir, err := FindVagrantfileDir()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}

	fmt.Println("Powering off the Vagrant VM...")
	cmd := exec.Command("vagrant", "halt")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		fmt.Printf("Error: Failed to halt VM: %v\n", err)
		return false
	}

	fmt.Println("==================================================")
	fmt.Println("VM successfully powered off. Run 'labops start' to resume.")
	return true
}
