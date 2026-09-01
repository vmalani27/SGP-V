package main

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// CheckVirtualization checks if hardware virtualization is enabled in firmware/CPU.
func CheckVirtualization() (bool, error) {
	switch runtime.GOOS {
	case "windows":
		// Check using Powershell to query HypervisorPresent or Win32_Processor
		cmd := exec.Command("powershell", "-Command", "(Get-CimInstance Win32_ComputerSystem).HypervisorPresent")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err == nil {
			val := strings.TrimSpace(out.String())
			if strings.EqualFold(val, "True") {
				return true, nil
			}
		}

		// Fallback: Check Win32_Processor VirtualizationFirmwareEnabled
		cmd2 := exec.Command("powershell", "-Command", "(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled")
		var out2 bytes.Buffer
		cmd2.Stdout = &out2
		if err := cmd2.Run(); err == nil {
			val := strings.TrimSpace(out2.String())
			if strings.EqualFold(val, "True") || val == "1" {
				return true, nil
			}
		}

		// Second fallback: check systeminfo output
		cmd3 := exec.Command("systeminfo")
		var out3 bytes.Buffer
		cmd3.Stdout = &out3
		if err := cmd3.Run(); err == nil {
			if strings.Contains(out3.String(), "Virtualization Enabled In Firmware: Yes") ||
				strings.Contains(out3.String(), "Hypervisor has been detected") {
				return true, nil
			}
		}

		return false, nil

	case "darwin":
		// macOS check VMX in machdep.cpu.features
		cmd := exec.Command("sysctl", "-n", "machdep.cpu.features")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err != nil {
			return false, err
		}
		return strings.Contains(strings.ToLower(out.String()), "vmx"), nil

	case "linux":
		// Linux check /proc/cpuinfo
		file, err := os.Open("/proc/cpuinfo")
		if err != nil {
			return false, err
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "flags") {
				flags := strings.Fields(line)
				for _, flag := range flags {
					if flag == "vmx" || flag == "svm" {
						return true, nil
					}
				}
			}
		}
		return false, nil

	default:
		return false, fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// CheckRAM checks total system RAM in gigabytes (GB).
func CheckRAM() (float64, error) {
	switch runtime.GOOS {
	case "windows":
		cmd := exec.Command("powershell", "-Command", "[math]::round((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1024 / 1024, 2)")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err != nil {
			return 0, err
		}
		val, err := strconv.ParseFloat(strings.TrimSpace(out.String()), 64)
		if err != nil {
			return 0, err
		}
		return val, nil

	case "darwin":
		cmd := exec.Command("sysctl", "-n", "hw.memsize")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err != nil {
			return 0, err
		}
		bytesVal, err := strconv.ParseFloat(strings.TrimSpace(out.String()), 64)
		if err != nil {
			return 0, err
		}
		return bytesVal / (1024 * 1024 * 1024), nil

	case "linux":
		file, err := os.Open("/proc/meminfo")
		if err != nil {
			return 0, err
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					kbVal, err := strconv.ParseFloat(fields[1], 64)
					if err != nil {
						return 0, err
					}
					return kbVal / (1024 * 1024), nil
				}
			}
		}
		return 0, fmt.Errorf("could not find MemTotal in /proc/meminfo")

	default:
		return 0, fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// CheckDisk checks free space in GB on the primary partition.
func CheckDisk() (float64, error) {
	switch runtime.GOOS {
	case "windows":
		cmd := exec.Command("powershell", "-Command", "[math]::round((Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\").FreeSpace / 1024 / 1024 / 1024, 2)")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err != nil {
			return 0, err
		}
		val, err := strconv.ParseFloat(strings.TrimSpace(out.String()), 64)
		if err != nil {
			return 0, err
		}
		return val, nil

	case "darwin", "linux":
		// run df -k / and parse
		cmd := exec.Command("df", "-k", "/")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err != nil {
			return 0, err
		}

		lines := strings.Split(out.String(), "\n")
		if len(lines) < 2 {
			return 0, fmt.Errorf("unexpected output from df: %s", out.String())
		}
		fields := strings.Fields(lines[1])
		// For macOS/Linux df -k:
		// Filesystem 1024-blocks Used Available Capacity Mounted on
		// Field[3] is usually Free/Available blocks of 1KB size
		if len(fields) >= 4 {
			kbVal, err := strconv.ParseFloat(fields[3], 64)
			if err != nil {
				// Sometimes Mac df outputs split lines if filesystem name is long
				if len(lines) >= 3 {
					fields = strings.Fields(lines[2])
					if len(fields) >= 3 {
						kbVal, err = strconv.ParseFloat(fields[2], 64)
					}
				}
			}
			if err == nil {
				return kbVal / (1024 * 1024), nil
			}
		}
		return 0, fmt.Errorf("could not parse df output")

	default:
		return 0, fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// CheckDependency verifies if a binary is present in the system PATH.
func CheckDependency(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

// CheckHypervisorInstalled checks standard paths in addition to the system PATH.
func CheckHypervisorInstalled() (hasVirtualBox bool, hasVMware bool) {
	hasVirtualBox = CheckDependency("vboxmanage")
	hasVMware = CheckDependency("vmware") || CheckDependency("vmrun")

	if hasVirtualBox && hasVMware {
		return true, true
	}

	if runtime.GOOS == "windows" {
		if !hasVirtualBox {
			vboxPaths := []string{
				`C:\Program Files\Oracle\VirtualBox\VBoxManage.exe`,
				`C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe`,
			}
			for _, path := range vboxPaths {
				if _, err := os.Stat(path); err == nil {
					hasVirtualBox = true
					break
				}
			}
		}
		if !hasVMware {
			vmwarePaths := []string{
				`C:\Program Files\VMware\VMware Workstation\vmrun.exe`,
				`C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe`,
				`C:\Program Files\VMware\VMware Player\vmrun.exe`,
			}
			for _, path := range vmwarePaths {
				if _, err := os.Stat(path); err == nil {
					hasVMware = true
					break
				}
			}
		}
	}

	if runtime.GOOS == "darwin" {
		if !hasVirtualBox {
			if _, err := os.Stat("/Applications/VirtualBox.app"); err == nil {
				hasVirtualBox = true
			}
		}
		if !hasVMware {
			if _, err := os.Stat("/Applications/VMware Fusion.app"); err == nil {
				hasVMware = true
			}
		}
	}

	return hasVirtualBox, hasVMware
}

// RunDoctor runs all hardware and software diagnostics.
func RunDoctor() bool {
	fmt.Println("Running LabOps Diagnostics & Preflight Checks...")
	fmt.Println("==================================================")
	allPassed := true

	// 1. Virtualization
	fmt.Print("Hardware Virtualization (VT-x/AMD-V): ")
	virt, err := CheckVirtualization()
	if err != nil {
		fmt.Printf("FAILED to detect (%v)\n", err)
		allPassed = false
	} else if virt {
		fmt.Println("OK")
	} else {
		fmt.Println("FAILED (Enable Virtualization/VT-x/AMD-V in your BIOS/UEFI firmware)")
		allPassed = false
	}

	// 2. RAM check
	fmt.Print("System RAM: ")
	ram, err := CheckRAM()
	if err != nil {
		fmt.Printf("Unknown (%v)\n", err)
	} else {
		if ram >= 7.5 {
			fmt.Printf("OK (%.2f GB)\n", ram)
		} else if ram >= 4.0 {
			fmt.Printf("WARNING: %.2f GB (Minimum required is 4GB; 8GB recommended for smoother experience)\n", ram)
		} else {
			fmt.Printf("FAILED: %.2f GB (Insufficient! Minimum required is 4GB)\n", ram)
			allPassed = false
		}
	}

	// 3. Disk space check
	fmt.Print("Available Disk Space: ")
	disk, err := CheckDisk()
	if err != nil {
		fmt.Printf("Unknown (%v)\n", err)
	} else {
		if disk >= 20.0 {
			fmt.Printf("OK (%.2f GB)\n", disk)
		} else if disk >= 10.0 {
			fmt.Printf("WARNING: %.2f GB (Low disk space; at least 15-20GB recommended to download VM boxes)\n", disk)
		} else {
			fmt.Printf("FAILED: %.2f GB (Insufficient! Less than 10GB free space)\n", disk)
			allPassed = false
		}
	}

	// 4. Dependencies
	fmt.Println("\nPrerequisite Software:")
	
	vagrantPassed := CheckDependency("vagrant")
	if vagrantPassed {
		fmt.Println("  - Vagrant: OK")
	} else {
		fmt.Println("  - Vagrant: MISSING (Run 'labops setup' or install from hashicorp.com/vagrant)")
		allPassed = false
	}

	// Check for a hypervisor: vboxmanage (VirtualBox) or vmware (VMware)
	hasVbox, hasVMware := CheckHypervisorInstalled()
	hypervisorPassed := hasVbox || hasVMware
	if hypervisorPassed {
		fmt.Println("  - Hypervisor (VirtualBox/VMware): OK")
	} else {
		fmt.Println("  - Hypervisor (VirtualBox/VMware): MISSING (Install VirtualBox or VMware Player/Workstation)")
		allPassed = false
	}

	fmt.Println("==================================================")
	if allPassed {
		fmt.Println("All preflight checks passed! Your system is ready for LabOps.")
	} else {
		fmt.Println("Some checks failed. Please address the errors above before starting.")
	}

	return allPassed
}
