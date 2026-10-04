//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

type MEMORYSTATUSEX struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

func getWindowsVirtualization() (bool, error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	isProcessorFeaturePresent := kernel32.NewProc("IsProcessorFeaturePresent")
	ret, _, _ := isProcessorFeaturePresent.Call(21)
	if ret != 0 {
		return true, nil
	}

	if CheckDependency("wsl.exe") || CheckDependency("docker") {
		return true, nil
	}

	return false, nil
}

func getWindowsRAM() (float64, error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")
	var memStatus MEMORYSTATUSEX
	memStatus.Length = uint32(unsafe.Sizeof(memStatus))
	ret, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&memStatus)))
	if ret == 0 {
		return 0, fmt.Errorf("GlobalMemoryStatusEx failed")
	}
	return float64(memStatus.TotalPhys) / (1024 * 1024 * 1024), nil
}

func getWindowsDisk() (float64, error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceExW := kernel32.NewProc("GetDiskFreeSpaceExW")
	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes uint64
	cPath, err := syscall.UTF16PtrFromString("C:\\")
	if err != nil {
		return 0, err
	}
	ret, _, _ := getDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(cPath)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if ret == 0 {
		return 0, fmt.Errorf("GetDiskFreeSpaceExW failed")
	}
	return float64(freeBytesAvailable) / (1024 * 1024 * 1024), nil
}
