//go:build !windows

package main

import "fmt"

func getWindowsVirtualization() (bool, error) {
	return false, fmt.Errorf("windows only")
}

func getWindowsRAM() (float64, error) {
	return 0, fmt.Errorf("windows only")
}

func getWindowsDisk() (float64, error) {
	return 0, fmt.Errorf("windows only")
}
