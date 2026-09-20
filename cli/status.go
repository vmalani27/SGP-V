package main

import (
	"fmt"
)

// RunStatus checks if LabOps services are running and prints a clean, single-line message.
func RunStatus() bool {
	if IsAlreadyHealthy() {
		fmt.Println("LabOps is running at http://localhost:3000")
		return true
	}

	fmt.Println("LabOps is not running. Run 'labops start' to start, or restart the CLI.")
	return false
}
