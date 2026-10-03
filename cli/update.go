package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type managedImage struct {
	Name   string
	Remote string
	Tags   []string
}

type ReleaseContentMeta struct {
	Version        string `json:"version"`
	ArtifactSHA256 string `json:"artifact_sha256"`
	ArchiveURL     string `json:"archive_url"`
	CatalogURL     string `json:"catalog_url"`
}

type ReleaseImageMeta struct {
	Remote string `json:"remote"`
	Digest string `json:"digest,omitempty"`
	Alias  string `json:"alias,omitempty"`
}

type ReleaseManifest struct {
	Version     string                      `json:"version"`
	Channel     string                      `json:"channel"`
	PublishedAt string                      `json:"published_at"`
	Content     ReleaseContentMeta          `json:"content"`
	Images      map[string]ReleaseImageMeta `json:"images"`
}

type installState struct {
	ReleaseVersion string            `json:"release_version,omitempty"`
	Channel        string            `json:"channel"`
	ContentVersion string            `json:"content_version,omitempty"`
	UpdatedAt      string            `json:"updated_at"`
	Images         map[string]string `json:"images"`
	ImageDigests   map[string]string `json:"image_digests"`
}

var defaultChannel = "dev"
var defaultCDNURL = ""
var defaultRegistry = ""

func registryBase() string {
	if reg := strings.TrimSpace(os.Getenv("ECR_PUBLIC_REGISTRY")); reg != "" {
		return reg
	}
	return defaultRegistry
}

func labOpsImages(channel string) []managedImage {
	base := registryBase()
	return []managedImage{
		{Name: "Frontend Service", Remote: base + "/labops-frontend:" + channel},
		{Name: "Orchestrator Service", Remote: base + "/labops-orchestrator:" + channel},
		{Name: "Content-Sync Sidecar", Remote: base + "/labops-content-sync:" + channel},
		{Name: "Proxy Image", Remote: base + "/labops-base:nginx-alpine"},
		{Name: "Git Server Image", Remote: base + "/labops-base:gitea-latest"},
		{Name: "Base Ubuntu Lab Image", Remote: base + "/labops-base:" + channel, Tags: []string{"labops-ubuntu:latest"}},
		{Name: "Docker Lab (DinD)", Remote: base + "/labops-labs:docker-" + channel, Tags: []string{"labops-docker:latest"}},
		{Name: "Docker Fundamentals Lab", Remote: base + "/labops-labs:docker-fundamentals-" + channel, Tags: []string{"labops-docker-fundamentals:latest"}},
		{Name: "Docker Build Lab", Remote: base + "/labops-labs:docker-build-" + channel, Tags: []string{"labops-docker-build:latest"}},
		{Name: "Git Fundamentals Lab", Remote: base + "/labops-labs:git-fundamentals-" + channel, Tags: []string{"labops-git-fundamentals:latest"}},
	}
}

func imageDisplayName(key string) string {
	switch key {
	case "frontend":
		return "Frontend Service"
	case "orchestrator":
		return "Orchestrator Service"
	case "content-sync":
		return "Content-Sync Sidecar"
	case "proxy":
		return "Proxy Image"
	case "git-server":
		return "Git Server Image"
	case "labops-ubuntu":
		return "Base Ubuntu Lab Image"
	case "labops-docker":
		return "Docker Lab (DinD)"
	case "labops-docker-fundamentals":
		return "Docker Fundamentals Lab"
	case "labops-docker-build":
		return "Docker Build Lab"
	case "labops-git-fundamentals":
		return "Git Fundamentals Lab"
	default:
		return key
	}
}

func selectedChannel() string {
	for i, arg := range os.Args[2:] {
		lower := strings.ToLower(arg)
		if (lower == "--channel" || lower == "-c") && i+1 < len(os.Args[2:]) {
			return strings.ToLower(os.Args[2+i+1])
		}
		if strings.HasPrefix(lower, "--channel=") {
			return strings.ToLower(strings.TrimPrefix(lower, "--channel="))
		}
	}
	channel := strings.TrimSpace(os.Getenv("LABOPS_CHANNEL"))
	if channel == "" {
		return defaultChannel
	}
	return channel
}

// GetContentCDNURL returns the content CDN URL injected at build or overridden via environment.
func GetContentCDNURL() string {
	if env := strings.TrimSpace(os.Getenv("CDN_URL")); env != "" {
		return env
	}
	return defaultCDNURL
}

func fetchReleaseManifest(cdnURL string, channel string) (*ReleaseManifest, error) {
	if cdnURL == "" {
		return nil, fmt.Errorf("no CDN URL configured")
	}
	url := fmt.Sprintf("%s/releases/%s.json", strings.TrimRight(cdnURL, "/"), channel)
	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d fetching release manifest", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var manifest ReleaseManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("invalid release manifest JSON: %v", err)
	}
	return &manifest, nil
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
	cdnURL := GetContentCDNURL()
	manifest, err := fetchReleaseManifest(cdnURL, channel)

	state := installState{
		Channel:      channel,
		UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
		Images:       make(map[string]string),
		ImageDigests: make(map[string]string),
	}

	if useWSL {
		fmt.Printf("Updating LabOps (%s channel) via WSL2 (%s)\n", channel, wslDistro)
	} else {
		fmt.Printf("Updating LabOps (%s channel)\n", channel)
	}
	if manifest != nil {
		fmt.Printf("Release version: %s\n", manifest.Version)
		state.ReleaseVersion = manifest.Version
		state.ContentVersion = manifest.Content.Version
	} else {
		fmt.Printf("Notice: No release manifest for channel '%s' (falling back to direct channel tags)\n", channel)
		if err != nil {
			// Intentionally silent or verbose if needed
		}
	}

	fmt.Println("==================================================")
	fmt.Println("[1/2] Updating course curriculum content...")
	if err := SyncCourseContent(cdnURL, true); err != nil {
		fmt.Printf("Warning: Could not sync latest content from %s: %v\n", cdnURL, err)
		fmt.Println("Continuing with cached course content...")
	}

	fmt.Println("\n[2/2] Updating managed container images...")

	if manifest != nil && len(manifest.Images) > 0 {
		keys := make([]string, 0, len(manifest.Images))
		for k := range manifest.Images {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		for index, key := range keys {
			imgMeta := manifest.Images[key]
			name := imageDisplayName(key)
			target := imgMeta.Remote

			fmt.Printf("  - [%d/%d] Updating %s (%s)...\n", index+1, len(keys), name, imgMeta.Remote)
			var cmd *exec.Cmd
			if useWSL {
				cmd = exec.Command("wsl.exe", "-d", wslDistro, "docker", "pull", target)
			} else {
				cmd = exec.Command("docker", "pull", target)
			}
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err != nil {
				fmt.Printf("Update failed for %s: %v\n", name, err)
				return false
			}

			if imgMeta.Alias != "" {
				var tagCmd *exec.Cmd
				if useWSL {
					tagCmd = exec.Command("wsl.exe", "-d", wslDistro, "docker", "tag", target, imgMeta.Alias)
				} else {
					tagCmd = exec.Command("docker", "tag", target, imgMeta.Alias)
				}
				if err := tagCmd.Run(); err != nil {
					fmt.Printf("Update failed while tagging %s as %s: %v\n", name, imgMeta.Alias, err)
					return false
				}
			}

			state.Images[key] = imgMeta.Remote
			digest := imgMeta.Digest
			if digest == "" {
				digest = imageDigest(target, useWSL, wslDistro)
			}
			state.ImageDigests[key] = digest
		}
	} else {
		images := labOpsImages(channel)
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
	}

	if state.ContentVersion == "" {
		state.ContentVersion = ReadLocalContentVersion()
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
	if state.ReleaseVersion != "" {
		fmt.Printf("LabOps release:  %s\n", state.ReleaseVersion)
	} else {
		fmt.Println("LabOps release:  (custom / dev build)")
	}
	fmt.Printf("LabOps channel:  %s\n", state.Channel)
	fmt.Printf("Content CDN:     %s\n", GetContentCDNURL())
	fmt.Printf("Content version: %s\n", ReadLocalContentVersion())
	fmt.Printf("Content cache:   %s\n", GetContentDir())
	fmt.Printf("Last update:     %s\n", state.UpdatedAt)
	fmt.Printf("Managed images:  %d\n", len(state.Images))
	if len(state.ImageDigests) > 0 {
		fmt.Println("\nInstalled Images & Digests:")
		keys := make([]string, 0, len(state.ImageDigests))
		for k := range state.ImageDigests {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, img := range keys {
			digest := state.ImageDigests[img]
			if digest != "" {
				fmt.Printf("  - %-28s %s\n", img, digest)
			} else {
				fmt.Printf("  - %-28s %s\n", img, state.Images[img])
			}
		}
	}
	return true
}