package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type managedImage struct {
	Name   string
	Remote string
	Tags   []string
}

type installState struct {
	Channel     string            `json:"channel"`
	UpdatedAt   string            `json:"updated_at"`
	Images      map[string]string `json:"images"`
	ImageDigests map[string]string `json:"image_digests"`
}

func registryBase() string {
	if reg := strings.TrimSpace(os.Getenv("ECR_REGISTRY")); reg != "" {
		return reg
	}
	return "public.ecr.aws/i9t1l0m7/vmalani27"
}

func labOpsImages(channel string) []managedImage {
	base := registryBase()
	return []managedImage{
		{Name: "Frontend", Remote: base + "/labops-frontend:" + channel},
		{Name: "Orchestrator", Remote: base + "/labops-orchestrator:" + channel},
		{Name: "Ubuntu lab", Remote: base + "/labops-base:" + channel, Tags: []string{"labops-ubuntu:latest", "sgp-lab-ubuntu:latest"}},
		{Name: "Docker lab", Remote: base + "/labops-labs:docker-" + channel, Tags: []string{"labops-docker:latest", "sgp-lab-docker:latest"}},
		{Name: "Docker fundamentals lab", Remote: base + "/labops-labs:docker-fundamentals-" + channel, Tags: []string{"labops-docker-fundamentals:latest", "sgp-lab-docker-fundamentals:latest"}},
		{Name: "Docker build lab", Remote: base + "/labops-labs:docker-build-" + channel, Tags: []string{"labops-docker-build:latest", "sgp-lab-docker-build:latest"}},
	}
}

var defaultChannel = "dev"
var defaultCDNURL = "https://d3rqfqpemi0u1s.cloudfront.net"

func selectedChannel() string {
	channel := strings.TrimSpace(os.Getenv("LABOPS_CHANNEL"))
	if channel == "" {
		return defaultChannel
	}
	return channel
}

// GetContentCDNURL returns the content CDN URL injected at build or overridden via environment.
func GetContentCDNURL() string {
	if env := strings.TrimSpace(os.Getenv("CONTENT_PUBLIC_BASE_URL")); env != "" {
		return env
	}
	if env := strings.TrimSpace(os.Getenv("LABOPS_CDN_URL")); env != "" {
		return env
	}
	if defaultCDNURL != "" {
		return defaultCDNURL
	}
	return ""
}

func statePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(configDir, "labops")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "state.json"), nil
}

func imageDigest(image string, useWSL bool, wslDistro string) string {
	var cmd *exec.Cmd
	if useWSL {
		cmd = exec.Command("wsl.exe", "-d", wslDistro, "docker", "image", "inspect", "--format", "{{index .RepoDigests 0}}", image)
	} else {
		cmd = exec.Command("docker", "image", "inspect", "--format", "{{index .RepoDigests 0}}", image)
	}
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func saveInstallState(state installState) error {
	path, err := statePath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

// RunUpdate installs or updates the student-facing application and lab images.
func RunUpdate() bool {
	wslReady, wslDistro := CheckWSLDockerReady()
	useWSL := false

	if !IsDockerDaemonRunning() {
		if wslReady {
			useWSL = true
		} else {
			fmt.Println("LabOps cannot update because the Docker daemon is not running on host or inside WSL2.")
			return false
		}
	}

	channel := selectedChannel()
	images := labOpsImages(channel)
	state := installState{
		Channel:      channel,
		UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
		Images:       make(map[string]string, len(images)),
		ImageDigests: make(map[string]string, len(images)),
	}

	if useWSL {
		fmt.Printf("Updating LabOps (%s channel) via WSL2 (%s)\n", channel, wslDistro)
	} else {
		fmt.Printf("Updating LabOps (%s channel)\n", channel)
	}
	fmt.Println("==================================================")
	fmt.Println("[1/2] Updating course curriculum content...")
	cdnURL := GetContentCDNURL()
	if err := SyncCourseContent(cdnURL, true); err != nil {
		fmt.Printf("Warning: Could not sync latest content from %s: %v\n", cdnURL, err)
		fmt.Println("Continuing with cached course content...")
	}

	fmt.Println("\n[2/2] Updating managed container images...")
	for index, image := range images {
		fmt.Printf("  - [%d/%d] Updating %s...\n", index+1, len(images), image.Name)
		var cmd *exec.Cmd
		if useWSL {
			cmd = exec.Command("wsl.exe", "-d", wslDistro, "docker", "pull", image.Remote)
		} else {
			cmd = exec.Command("docker", "pull", image.Remote)
		}
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Printf("Update failed for %s: %v\n", image.Name, err)
			return false
		}
		for _, tag := range image.Tags {
			var tagCmd *exec.Cmd
			if useWSL {
				tagCmd = exec.Command("wsl.exe", "-d", wslDistro, "docker", "tag", image.Remote, tag)
			} else {
				tagCmd = exec.Command("docker", "tag", image.Remote, tag)
			}
			if err := tagCmd.Run(); err != nil {
				fmt.Printf("Update failed while preparing %s: %v\n", image.Name, err)
				return false
			}
		}
		state.Images[image.Name] = image.Remote
		state.ImageDigests[image.Name] = imageDigest(image.Remote, useWSL, wslDistro)
	}

	if err := saveInstallState(state); err != nil {
		fmt.Printf("Images updated, but LabOps state could not be saved: %v\n", err)
		return false
	}
	fmt.Println("==================================================")
	fmt.Println("LabOps is up to date. Run 'labops start' to launch it.")
	return true
}

// RunVersion displays the locally recorded application update state.
func RunVersion() bool {
	path, err := statePath()
	if err != nil {
		fmt.Printf("Unable to locate LabOps state: %v\n", err)
		return false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Println("LabOps is not installed. Run 'labops update' first.")
			return true
		}
		fmt.Printf("Unable to read LabOps state: %v\n", err)
		return false
	}
	var state installState
	if err := json.Unmarshal(data, &state); err != nil {
		fmt.Printf("LabOps state is invalid: %v\n", err)
		return false
	}
	fmt.Printf("LabOps channel:  %s\n", state.Channel)
	fmt.Printf("Content CDN:     %s\n", GetContentCDNURL())
	fmt.Printf("Content version: %s\n", ReadLocalContentVersion())
	fmt.Printf("Content cache:   %s\n", GetContentDir())
	fmt.Printf("Last update:     %s\n", state.UpdatedAt)
	fmt.Printf("Managed images:  %d\n", len(state.Images))
	return true
}