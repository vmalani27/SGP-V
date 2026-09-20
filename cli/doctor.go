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
// ListWSLDistros returns available WSL Linux distributions (excluding docker-desktop internal distros).
func ListWSLDistros() []string {
	if runtime.GOOS != "windows" {
		return nil
	}
	cmd := exec.Command("wsl.exe", "-l", "-q")
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	// wsl.exe outputs UTF-16LE, which contains 0x00 bytes when read as ASCII
	cleaned := strings.ReplaceAll(string(out), "\x00", "")
	lines := strings.Split(cleaned, "\n")
	var distros []string
	for _, line := range lines {
		d := strings.TrimSpace(line)
		if d == "" {
			continue
		}
		lower := strings.ToLower(d)
		if strings.HasPrefix(lower, "docker-desktop") {
			continue
		}
		distros = append(distros, d)
	}
	return distros
}

func parseWSLConfSystemd(content string) bool {
	lines := strings.Split(content, "\n")
	inBoot := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			inBoot = strings.EqualFold(line, "[boot]")
			continue
		}
		if inBoot && strings.HasPrefix(strings.ToLower(line), "systemd=") {
			val := strings.TrimSpace(strings.SplitN(line, "=", 2)[1])
			if strings.EqualFold(val, "true") {
				return true
			}
		}
	}
	return false
}

// CheckWSL2Systemd checks if /etc/wsl.conf contains systemd=true in WSL2.
// Returns (systemdEnabled, distroName, error).
func CheckWSL2Systemd() (bool, string, error) {
	if runtime.GOOS == "linux" {
		data, err := os.ReadFile("/etc/wsl.conf")
		if err != nil {
			return false, "", err
		}
		return parseWSLConfSystemd(string(data)), "native", nil
	}

	if runtime.GOOS != "windows" {
		return false, "", nil
	}

	distros := ListWSLDistros()
	if preferred := strings.TrimSpace(os.Getenv("LABOPS_WSL_DISTRO")); preferred != "" {
		distros = append([]string{preferred}, distros...)
	}

	if len(distros) == 0 {
		return false, "", fmt.Errorf("no WSL2 Linux distributions found")
	}

	// First pass: look for a distribution with active systemd or systemd=true in /etc/wsl.conf
	for _, distro := range distros {
		// Check running systemd state directly
		cmdRunning := exec.Command("wsl.exe", "-d", distro, "systemctl", "is-system-running")
		if out, err := cmdRunning.Output(); err == nil {
			s := strings.TrimSpace(string(out))
			if s == "running" || s == "degraded" {
				return true, distro, nil
			}
		}

		// Fallback to checking /etc/wsl.conf
		cmd := exec.Command("wsl.exe", "-d", distro, "cat", "/etc/wsl.conf")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err == nil {
			if parseWSLConfSystemd(out.String()) {
				return true, distro, nil
			}
		}
	}

	return false, distros[0], nil
}

// CheckPort80Availability checks if local port 80 (or fallback 8080) is available.
func CheckPort80Availability() (bool, int) {
	port := 80
	if !CheckPortAvailable(port) {
		// fallback to 8080
		port = 8080
		if !CheckPortAvailable(port) {
			return false, 0
		}
	}
	return true, port
}

// RunDoctor runs all hardware and software diagnostics in a clean, student-friendly format.
func RunDoctor() bool {
	fmt.Println("LabOps System Check")
	fmt.Println("------------------------------------")

	allPassed := true
	var failureHints []string

	// 1. System requirements (Virtualization + RAM + Disk)
	virt, _ := CheckVirtualization()
	ram, _ := CheckRAM()
	disk, _ := CheckDisk()

	sysOk := true
	var sysDetail string
	if !virt {
		sysOk = false
		sysDetail = "Hardware virtualization disabled in BIOS"
		failureHints = append(failureHints, "Enable CPU Virtualization (VT-x / AMD-V) in your computer's BIOS/UEFI settings.")
	} else if ram > 0 && ram < 4.0 {
		sysOk = false
		sysDetail = fmt.Sprintf("Insufficient RAM (%.1f GB, minimum 4 GB required)", ram)
		failureHints = append(failureHints, "LabOps requires at least 4 GB of system RAM to run smoothly.")
	} else if disk > 0 && disk < 10.0 {
		sysOk = false
		sysDetail = fmt.Sprintf("Low disk space (%.1f GB free, minimum 10 GB required)", disk)
		failureHints = append(failureHints, "Free up at least 10 GB of disk space for container storage and lab environments.")
	} else {
		ramGB := int(ram + 0.5)
		diskGB := int(disk + 0.5)
		if ramGB > 0 && diskGB > 0 {
			sysDetail = fmt.Sprintf("%d GB RAM / %d GB Free Disk", ramGB, diskGB)
		} else {
			sysDetail = "Hardware requirements met"
		}
	}

	if sysOk {
		fmt.Printf("  ✔ %-23s %s\n", "System requirements", sysDetail)
	} else {
		allPassed = false
		fmt.Printf("  ✖ %-23s %s\n", "System requirements", sysDetail)
	}

	// 2. Subsystem / Environment
	envOk := true
	var envDetail string

	switch runtime.GOOS {
	case "windows":
		sysd, distro, _ := CheckWSL2Systemd()
		if distro != "" {
			envDetail = fmt.Sprintf("WSL2 (%s)", distro)
			if !sysd {
				envOk = false
				envDetail = fmt.Sprintf("WSL2 (%s - systemd not enabled)", distro)
				failureHints = append(failureHints, fmt.Sprintf("Enable systemd in WSL2: add '[boot]\\nsystemd=true' to /etc/wsl.conf in %s and run 'wsl --shutdown'.", distro))
			}
		} else {
			envOk = false
			envDetail = "WSL2 not found"
			failureHints = append(failureHints, "Install WSL2 by opening PowerShell as Administrator and running: wsl --install -d Ubuntu-22.04")
		}
		if envOk {
			fmt.Printf("  ✔ %-23s %s\n", "Windows Subsystem", envDetail)
		} else {
			allPassed = false
			fmt.Printf("  ✖ %-23s %s\n", "Windows Subsystem", envDetail)
		}
	case "linux":
		fmt.Printf("  ✔ %-23s %s\n", "Linux Environment", "Native Linux Kernel")
	case "darwin":
		fmt.Printf("  ✔ %-23s %s\n", "macOS Environment", "Darwin Kernel")
	}

	// 3. Lab Runtime Engine (Docker in WSL2 or Host Docker)
	engineOk := false
	var engineDetail string

	if runtime.GOOS == "windows" {
		if wslReady, _ := CheckWSLDockerReady(); wslReady {
			engineOk = true
			engineDetail = "Ready"
		} else if IsDockerDaemonRunning() {
			engineOk = true
			engineDetail = "Ready"
		} else {
			if CheckDependency("docker") {
				engineDetail = "Stopped (Docker Engine is not running)"
				failureHints = append(failureHints, "Start Docker Desktop or start Docker inside WSL2 ('sudo service docker start').")
			} else {
				engineDetail = "Docker not installed"
				failureHints = append(failureHints, "Install Docker Desktop for Windows or install Docker inside your WSL2 Ubuntu distro.")
			}
		}
	} else {
		if IsDockerDaemonRunning() {
			engineOk = true
			engineDetail = "Ready"
		} else {
			engineDetail = "Docker daemon not running"
			failureHints = append(failureHints, "Ensure the Docker daemon is running ('sudo systemctl start docker').")
		}
	}

	if engineOk {
		fmt.Printf("  ✔ %-23s %s\n", "Lab Runtime Engine", engineDetail)
	} else {
		allPassed = false
		fmt.Printf("  ✖ %-23s %s\n", "Lab Runtime Engine", engineDetail)
	}

	// 4. Local Workspace Port
	portOk := false
	var portDetail string

	// If LabOps is already running, port 3000 is occupied by us, which is valid and expected
	if IsAlreadyHealthy() {
		portOk = true
		portDetail = "Available (LabOps is active)"
	} else {
		ok3000 := CheckPortAvailable(3000)
		if ok3000 {
			portOk = true
			portDetail = "Available"
		} else {
			portDetail = "Unavailable (Port 3000 is occupied)"
			failureHints = append(failureHints, "Close applications using local port 3000 or run 'labops stop' to reset stale processes.")
		}
	}

	if portOk {
		fmt.Printf("  ✔ %-23s %s\n", "Workspace Port", portDetail)
	} else {
		allPassed = false
		fmt.Printf("  ✖ %-23s %s\n", "Workspace Port", portDetail)
	}

	// Result Summary
	fmt.Println()
	if allPassed {
		fmt.Println("Everything looks good! Run 'labops start' to begin.")
		return true
	}

	// If any check failed, print friendly troubleshooting suggestions
	fmt.Println("Action Needed:")
	for _, hint := range failureHints {
		fmt.Printf("  • %s\n", hint)
	}

	return false
}
