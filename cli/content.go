package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ContentVersionInfo represents the metadata published in latest.json.
type ContentVersionInfo struct {
	Version        string          `json:"version"`
	ArtifactSHA256 string          `json:"artifact_sha256"`
	PublishedAt    string          `json:"published_at,omitempty"`
	FromVersion    *string         `json:"from_version,omitempty"`
	Changes        json.RawMessage `json:"changes,omitempty"`
	DownloadURL    string          `json:"download_url,omitempty"`
}

// GetContentDir returns the host directory where course content is cached.
func GetContentDir() string {
	if custom := os.Getenv("LABOPS_CONTENT_DIR"); custom != "" {
		return custom
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".labops", "content")
	}
	return filepath.Join(home, ".labops", "content")
}

// ReadLocalContentVersion returns the version currently installed on host disk, if any.
func ReadLocalContentVersion() string {
	contentDir := GetContentDir()
	verBytes, err := os.ReadFile(filepath.Join(contentDir, "version"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(verBytes))
}

// fetchRemoteVersion fetches latest.json from CloudFront / S3 CDN.
func fetchRemoteVersion(cdnURL string, timeout time.Duration) (*ContentVersionInfo, error) {
	if cdnURL == "" {
		return nil, fmt.Errorf("no CDN URL provided")
	}
	url := strings.TrimRight(cdnURL, "/") + "/latest.json"
	client := http.Client{Timeout: timeout}

	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d from %s", resp.StatusCode, url)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var info ContentVersionInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, fmt.Errorf("invalid latest.json: %v", err)
	}
	if info.Version == "" {
		return nil, fmt.Errorf("empty version in latest.json")
	}
	return &info, nil
}

// findLocalOutVersion checks if out/latest.json exists in local repo.
func findLocalOutVersion() (*ContentVersionInfo, string, error) {
	candidates := []string{
		"out",
		filepath.Join("..", "out"),
	}
	exe, err := os.Executable()
	if err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "out"), filepath.Join(filepath.Dir(exe), "..", "out"))
	}

	for _, c := range candidates {
		latestPath := filepath.Join(c, "latest.json")
		if data, err := os.ReadFile(latestPath); err == nil {
			var info ContentVersionInfo
			if err := json.Unmarshal(data, &info); err == nil && info.Version != "" {
				return &info, c, nil
			}
		}
	}
	return nil, "", fmt.Errorf("no local out/ directory found")
}

func extractTar(tarReader io.Reader, destDir string) error {
	tr := tar.NewReader(tarReader)
	cleanDest := filepath.Clean(destDir)

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		targetPath := filepath.Join(destDir, header.Name)
		cleanTarget := filepath.Clean(targetPath)
		if !strings.HasPrefix(cleanTarget, cleanDest+string(filepath.Separator)) && cleanTarget != cleanDest {
			return fmt.Errorf("illegal file path in archive: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				return err
			}
			outFile, err := os.OpenFile(targetPath, os.O_CREATE|os.O_RDWR|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(outFile, tr); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()
		}
	}
	return nil
}

// atomicSwap safely replaces targetDir with tmpDir.
func atomicSwap(tmpDir, targetDir string) error {
	parent := filepath.Dir(targetDir)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return err
	}

	backupDir := targetDir + "_old"
	_ = os.RemoveAll(backupDir)

	targetExists := false
	if _, err := os.Stat(targetDir); err == nil {
		targetExists = true
		if err := os.Rename(targetDir, backupDir); err != nil {
			// On Windows file locks, fallback to RemoveAll
			if err := os.RemoveAll(targetDir); err != nil {
				return fmt.Errorf("failed to replace active content directory: %v", err)
			}
			targetExists = false
		}
	}

	if err := os.Rename(tmpDir, targetDir); err != nil {
		if targetExists {
			_ = os.Rename(backupDir, targetDir)
		}
		return fmt.Errorf("failed to activate new content directory: %v", err)
	}

	if targetExists {
		_ = os.RemoveAll(backupDir)
	}
	return nil
}

// SyncCourseContent downloads, verifies, and atomically installs course content on the host.
func SyncCourseContent(cdnURL string, verbose bool) error {
	targetDir := GetContentDir()
	currentVer := ReadLocalContentVersion()

	// 1. Resolve target version
	var info *ContentVersionInfo
	var localOutDir string
	var downloadURL string
	var isLocal bool

	// Try remote CDN first
	remoteInfo, err := fetchRemoteVersion(cdnURL, 4*time.Second)
	if err == nil && remoteInfo != nil {
		info = remoteInfo
		downloadURL = strings.TrimRight(cdnURL, "/") + fmt.Sprintf("/published/%s/content.tar.gz", info.Version)
	} else {
		// Fallback to local repo out/
		localInfo, outDir, lErr := findLocalOutVersion()
		if lErr == nil && localInfo != nil {
			info = localInfo
			localOutDir = outDir
			isLocal = true
		}
	}

	if info == nil {
		if currentVer != "" {
			if verbose {
				fmt.Printf("Course content: Using offline cache (version %s)\n", currentVer)
			}
			return nil
		}
		return fmt.Errorf("could not resolve course content from CDN or local files")
	}

	// 2. Check if already current
	if currentVer == info.Version {
		// Verify required structure is intact
		if _, err := os.Stat(filepath.Join(targetDir, "data", "courses")); err == nil {
			if verbose {
				fmt.Printf("Course content is up to date (version %s)\n", currentVer)
			}
			return nil
		}
	}

	if verbose {
		fmt.Printf("Updating course content to version %s...\n", info.Version)
	}

	// 3. Prepare temporary extraction workspace
	parentDir := filepath.Dir(targetDir)
	_ = os.MkdirAll(parentDir, 0o755)
	tmpDir := filepath.Join(parentDir, fmt.Sprintf("content_tmp_%s_%d", info.Version, time.Now().UnixNano()))
	_ = os.RemoveAll(tmpDir)

	tmpDataDir := filepath.Join(tmpDir, "data")
	if err := os.MkdirAll(tmpDataDir, 0o755); err != nil {
		return fmt.Errorf("failed to create temp content dir: %v", err)
	}
	defer func() {
		// Ensure cleanup if function returns early
		_ = os.RemoveAll(tmpDir)
	}()

	// 4. Read tarball (from remote CDN or local out/)
	var gzBytes []byte
	if isLocal {
		tarPath := filepath.Join(localOutDir, "published", info.Version, "content.tar.gz")
		var rErr error
		gzBytes, rErr = os.ReadFile(tarPath)
		if rErr != nil {
			return fmt.Errorf("failed to read local content tarball: %v", rErr)
		}
	} else {
		client := http.Client{Timeout: 60 * time.Second}
		resp, err := client.Get(downloadURL)
		if err != nil {
			return fmt.Errorf("failed to download content from %s: %v", downloadURL, err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("failed to download content (%s returned %d)", downloadURL, resp.StatusCode)
		}
		var rErr error
		gzBytes, rErr = io.ReadAll(resp.Body)
		if rErr != nil {
			return fmt.Errorf("failed to read downloaded content stream: %v", rErr)
		}
	}

	// 5. Decompress gzip
	gzReader, err := gzip.NewReader(bytes.NewReader(gzBytes))
	if err != nil {
		return fmt.Errorf("corrupt content gzip archive: %v", err)
	}
	uncompressedBytes, err := io.ReadAll(gzReader)
	gzReader.Close()
	if err != nil {
		return fmt.Errorf("failed to decompress content tarball: %v", err)
	}

	// 6. Verify checksum (uncompressed tar SHA-256 matches manifest)
	if info.ArtifactSHA256 != "" {
		hasher := sha256.New()
		hasher.Write(uncompressedBytes)
		computedHash := hex.EncodeToString(hasher.Sum(nil))
		if !strings.HasPrefix(computedHash, info.ArtifactSHA256) && !strings.HasPrefix(info.ArtifactSHA256, computedHash[:16]) {
			return fmt.Errorf("checksum mismatch: expected %s, got %s", info.ArtifactSHA256, computedHash[:16])
		}
	}

	// 7. Extract tar entries into tmpDir/data
	if err := extractTar(bytes.NewReader(uncompressedBytes), tmpDataDir); err != nil {
		return fmt.Errorf("failed to extract content tar: %v", err)
	}

	// 8. Write catalog.json and metadata files into tmpDir
	// Fetch or copy catalog.json
	var catalogBytes []byte
	if isLocal {
		catalogBytes, _ = os.ReadFile(filepath.Join(localOutDir, "published", info.Version, "catalog.json"))
		if len(catalogBytes) == 0 {
			catalogBytes, _ = os.ReadFile(filepath.Join(localOutDir, "catalog.json"))
		}
	} else {
		catURL := strings.TrimRight(cdnURL, "/") + "/catalog.json"
		client := http.Client{Timeout: 8 * time.Second}
		if cResp, err := client.Get(catURL); err == nil && cResp.StatusCode == http.StatusOK {
			catalogBytes, _ = io.ReadAll(cResp.Body)
			cResp.Body.Close()
		}
	}

	if len(catalogBytes) > 0 {
		_ = os.WriteFile(filepath.Join(tmpDataDir, "catalog.json"), catalogBytes, 0o644)
		_ = os.WriteFile(filepath.Join(tmpDir, "catalog.json"), catalogBytes, 0o644)
	}

	// Write version marker and changes.json
	_ = os.WriteFile(filepath.Join(tmpDir, "version"), []byte(info.Version+"\n"), 0o644)

	changesData := map[string]interface{}{
		"version":      info.Version,
		"from_version": info.FromVersion,
		"changes":      info.Changes,
		"updatedAt":    info.PublishedAt,
	}
	if info.PublishedAt == "" {
		changesData["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
	}
	changesBytes, _ := json.MarshalIndent(changesData, "", "  ")
	_ = os.WriteFile(filepath.Join(tmpDir, "changes.json"), append(changesBytes, '\n'), 0o644)

	// 9. Verify structural integrity of extracted directory
	if _, err := os.Stat(filepath.Join(tmpDataDir, "courses")); err != nil {
		return fmt.Errorf("content verification failed: missing courses/ directory in archive")
	}

	// 10. Atomic Directory Swap
	if err := atomicSwap(tmpDir, targetDir); err != nil {
		return fmt.Errorf("atomic directory swap failed: %v", err)
	}

	if verbose {
		fmt.Printf("Course content installed successfully (version %s)\n", info.Version)
	}
	return nil
}
