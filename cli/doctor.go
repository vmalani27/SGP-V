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

	// First pass: look for a distribution with systemd=true
	for _, distro := range distros {
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

// CheckPort80Availability tries to bind to 0.0.0.0:80 to see if it's free.
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

// RunDoctor runs all hardware and software diagnostics.
func RunDoctor() bool {
	fmt.Println("Running LabOps Diagnostics & Preflight Checks...")
	fmt.Println("==================================================")

	// 1. Virtualization
	fmt.Print("Hardware Virtualization (VT-x/AMD-V): ")
	virt, err := CheckVirtualization()
	if err != nil {
		fmt.Printf("FAILED to detect (%v)\n", err)
	} else if virt {
		fmt.Println("OK")
	} else {
		fmt.Println("FAILED (Enable Virtualization/VT-x/AMD-V in your BIOS/UEFI firmware)")
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
		}
	}

	// Systemd enabled (WSL2):
	fmt.Print("Systemd enabled (WSL2): ")
	sysd, sysdDistro, err := CheckWSL2Systemd()
	if err != nil || !sysd {
		if sysdDistro != "" {
			fmt.Printf("✖ (systemd not enabled in %s) - add '[boot]\\nsystemd=true' to /etc/wsl.conf and restart WSL2\n", sysdDistro)
		} else {
			fmt.Println("✖ (systemd not enabled) - add '[boot]\\nsystemd=true' to /etc/wsl.conf and restart WSL2")
		}
	} else {
		if sysdDistro == "native" {
			fmt.Println("✔")
		} else {
			fmt.Printf("✔ (distro: %s)\n", sysdDistro)
		}
	}

	// Port 80 availability:
	fmt.Print("Port 80 availability: ")
	ok, port := CheckPort80Availability()
	if ok {
		if port == 80 {
			fmt.Println("✔ (free)")
		} else {
			fmt.Printf("✔ (80 busy, using fallback %d)\n", port)
		}
		os.Setenv("NGINX_PORT", fmt.Sprintf("%d", port))
	} else {
		fmt.Println("✖ (both 80 and 8080 occupied) - manual configuration required")
	}

	// 4. Dependencies
	fmt.Println("\nRuntime Software Diagnostics:")

	dockerCliPassed := CheckDependency("docker")
	dockerDaemonRunning := false
	if dockerCliPassed {
		cmd := exec.Command("docker", "info")
		if cmd.Run() == nil {
			dockerDaemonRunning = true
			fmt.Println("  - Docker CLI & Daemon: OK (Running on host)")
		}
	}

	wslDockerRunning := false
	wslSysboxDetected := false
	if runtime.GOOS == "windows" && sysd && sysdDistro != "" {
		cmd := exec.Command("wsl.exe", "-d", sysdDistro, "docker", "info")
		var out bytes.Buffer
		cmd.Stdout = &out
		if cmd.Run() == nil {
			wslDockerRunning = true
			if strings.Contains(strings.ToLower(out.String()), "sysbox-runc") {
				wslSysboxDetected = true
			}
		}
	}

	if !dockerDaemonRunning {
		if wslDockerRunning {
			fmt.Printf("  - Docker Engine: OK (Running inside WSL2: %s)\n", sysdDistro)
		} else if dockerCliPassed {
			fmt.Println("  - Docker CLI: OK (Daemon not running — start Docker Desktop or start Docker in WSL2)")
		} else {
			fmt.Println("  - Docker CLI: MISSING (Install Docker Desktop or Docker inside WSL2)")
		}
	}

	composePassed := false
	if dockerCliPassed {
		cmd := exec.Command("docker", "compose", "version")
		if cmd.Run() == nil {
			composePassed = true
			fmt.Println("  - Docker Compose v2: OK (Host)")
		}
	}
	if !composePassed && wslDockerRunning {
		cmd := exec.Command("wsl.exe", "-d", sysdDistro, "docker", "compose", "version")
		if cmd.Run() == nil {
			composePassed = true
			fmt.Printf("  - Docker Compose: OK (Inside WSL2: %s)\n", sysdDistro)
		}
	}
	if !composePassed {
		fmt.Println("  - Docker Compose: MISSING")
	}

	vagrantPassed := CheckDependency("vagrant")
	if vagrantPassed {
		fmt.Println("  - Vagrant: OK")
	} else {
		fmt.Println("  - Vagrant: NOT INSTALLED (Optional fallback)")
	}

	// Check for a hypervisor: vboxmanage (VirtualBox) or vmware (VMware)
	hasVbox, hasVMware := CheckHypervisorInstalled()
	hypervisorPassed := hasVbox || hasVMware
	if hypervisorPassed {
		fmt.Println("  - Hypervisor (VirtualBox/VMware): OK")
	} else {
		fmt.Println("  - Hypervisor (VirtualBox/VMware): NOT INSTALLED (Optional fallback)")
	}

	// Check for sysbox-runc in Docker info
	hasSysbox := false
	if dockerDaemonRunning {
		cmd := exec.Command("docker", "info")
		var out bytes.Buffer
		cmd.Stdout = &out
		if cmd.Run() == nil && strings.Contains(strings.ToLower(out.String()), "sysbox-runc") {
			hasSysbox = true
			fmt.Println("  - Sysbox Runtime (sysbox-runc): OK (Detected on host)")
		}
	} else if wslSysboxDetected {
		hasSysbox = true
		fmt.Printf("  - Sysbox Runtime (sysbox-runc): OK (Detected in WSL2: %s)\n", sysdDistro)
	}

	dockerModeReady := dockerCliPassed && dockerDaemonRunning && composePassed
	vmModeReady := vagrantPassed && hypervisorPassed

	fmt.Println("==================================================")
	fmt.Println("Runtime Mode Readiness:")
	if hasSysbox {
		if sysdDistro != "" && sysdDistro != "native" {
			fmt.Printf("  [✔] Native Sysbox Mode (WSL2: %s) : READY (Production-Identical, Fastest)\n", sysdDistro)
		} else {
			fmt.Println("  [✔] Native Sysbox Mode (Linux)        : READY (Production-Identical, Fastest)")
		}
	}
	if dockerModeReady {
		fmt.Println("  [✔] Docker Desktop Mode               : READY (Standard Dev Mode)")
	} else {
		fmt.Println("  [✖] Docker Desktop Mode               : NOT READY (Requires running Docker Engine)")
	}

	if vmModeReady {
		fmt.Println("  [✔] Vagrant VM Mode (Fallback)        : READY")
	} else {
		fmt.Println("  [✖] Vagrant VM Mode (Fallback)        : NOT CONFIGURED (Optional)")
	}

	fmt.Println("==================================================")
	if hasSysbox || dockerModeReady || vmModeReady {
		fmt.Println("System is ready! Run 'labops start' to launch.")
		return true
	}

	fmt.Println("Please install Docker Desktop or enable Docker inside WSL2/Linux to run LabOps.")
	return false
}
