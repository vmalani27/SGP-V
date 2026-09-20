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
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

type ContentVersionInfo struct {
	Version        string          `json:"version"`
	ArtifactSHA256 string          `json:"artifact_sha256"`
	PublishedAt    string          `json:"published_at,omitempty"`
	FromVersion    *string         `json:"from_version,omitempty"`
	Changes        json.RawMessage `json:"changes,omitempty"`
	DownloadURL    string          `json:"download_url,omitempty"`
}

type Syncer struct {
	cdnURL     string
	contentDir string
	interval   time.Duration
	client     *http.Client
	lastETag   string
}

func NewSyncer() *Syncer {
	cdnURL := os.Getenv("CONTENT_PUBLIC_BASE_URL")
	if cdnURL == "" {
		cdnURL = "https://d3rqfqpemi0u1s.cloudfront.net"
	}
	cdnURL = strings.TrimRight(cdnURL, "/")

	contentDir := os.Getenv("CONTENT_DIR")
	if contentDir == "" {
		contentDir = "/content"
	}

	intervalStr := os.Getenv("SYNC_INTERVAL")
	if intervalStr == "" {
		intervalStr = "15m"
	}
	interval, err := time.ParseDuration(intervalStr)
	if err != nil {
		log.Printf("[content-sync] Invalid SYNC_INTERVAL '%s', defaulting to 15m", intervalStr)
		interval = 15 * time.Minute
	}

	return &Syncer{
		cdnURL:     cdnURL,
		contentDir: contentDir,
		interval:   interval,
		client:     &http.Client{Timeout: 60 * time.Second},
	}
}

func (s *Syncer) readLocalVersion() string {
	verPath := filepath.Join(s.contentDir, "version")
	b, err := os.ReadFile(verPath)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func (s *Syncer) checkAndSync() error {
	latestURL := s.cdnURL + "/latest.json"
	req, err := http.NewRequest("GET", latestURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	if s.lastETag != "" {
		req.Header.Set("If-None-Match", s.lastETag)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch latest.json: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		log.Printf("[content-sync] HTTP 304: Content is up-to-date at CloudFront edge (ETag %s)", s.lastETag)
		return nil
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP %d from %s", resp.StatusCode, latestURL)
	}

	etag := resp.Header.Get("ETag")
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	var info ContentVersionInfo
	if err := json.Unmarshal(bodyBytes, &info); err != nil {
		return fmt.Errorf("invalid latest.json format: %w", err)
	}
	if info.Version == "" {
		return fmt.Errorf("empty version field in latest.json")
	}

	currentVersion := s.readLocalVersion()
	coursesPath := filepath.Join(s.contentDir, "data", "courses")
	hasCourses := false
	if fi, err := os.Stat(coursesPath); err == nil && fi.IsDir() {
		hasCourses = true
	}

	if currentVersion == info.Version && hasCourses {
		s.lastETag = etag
		log.Printf("[content-sync] Content is current (version %s)", currentVersion)
		return nil
	}

	log.Printf("[content-sync] New content version detected: %s (installed: '%s'). Starting download...", info.Version, currentVersion)
	start := time.Now()

	downloadURL := info.DownloadURL
	if downloadURL == "" {
		downloadURL = fmt.Sprintf("%s/published/%s/content.tar.gz", s.cdnURL, info.Version)
	}

	tarResp, err := s.client.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("failed to download %s: %w", downloadURL, err)
	}
	defer tarResp.Body.Close()

	if tarResp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d from %s", tarResp.StatusCode, downloadURL)
	}

	gzBytes, err := io.ReadAll(tarResp.Body)
	if err != nil {
		return fmt.Errorf("failed to read tarball stream: %w", err)
	}

	gzReader, err := gzip.NewReader(bytes.NewReader(gzBytes))
	if err != nil {
		return fmt.Errorf("corrupt gzip archive: %w", err)
	}
	uncompressedTar, err := io.ReadAll(gzReader)
	gzReader.Close()
	if err != nil {
		return fmt.Errorf("failed to decompress gzip archive: %w", err)
	}

	if info.ArtifactSHA256 != "" {
		hasher := sha256.New()
		hasher.Write(uncompressedTar)
		sum := hex.EncodeToString(hasher.Sum(nil))
		if !strings.HasPrefix(sum, info.ArtifactSHA256) && !strings.HasPrefix(info.ArtifactSHA256, sum[:16]) {
			return fmt.Errorf("checksum mismatch: expected %s, got %s", info.ArtifactSHA256, sum[:16])
		}
		log.Printf("[content-sync] Checksum verified: %s", sum[:16])
	}

	tmpDataDir := filepath.Join(s.contentDir, fmt.Sprintf("data_tmp_%s_%d", info.Version, time.Now().UnixNano()))
	if err := os.MkdirAll(tmpDataDir, 0o755); err != nil {
		return fmt.Errorf("failed to create temp extraction dir: %w", err)
	}
	defer os.RemoveAll(tmpDataDir)

	if err := extractTar(bytes.NewReader(uncompressedTar), tmpDataDir); err != nil {
		return fmt.Errorf("failed to extract tar: %w", err)
	}

	catalogURL := s.cdnURL + "/catalog.json"
	catResp, err := s.client.Get(catalogURL)
	var catalogBytes []byte
	if err == nil && catResp.StatusCode == http.StatusOK {
		catalogBytes, _ = io.ReadAll(catResp.Body)
		catResp.Body.Close()
	}

	if len(catalogBytes) > 0 {
		_ = os.WriteFile(filepath.Join(tmpDataDir, "catalog.json"), catalogBytes, 0o644)
		_ = os.WriteFile(filepath.Join(s.contentDir, "catalog.json"), catalogBytes, 0o644)
	}

	if _, err := os.Stat(filepath.Join(tmpDataDir, "courses")); err != nil {
		return fmt.Errorf("extracted directory missing 'courses/' folder, aborting swap")
	}

	activeDataDir := filepath.Join(s.contentDir, "data")
	backupDataDir := filepath.Join(s.contentDir, fmt.Sprintf("data_old_%d", time.Now().UnixNano()))

	if _, err := os.Stat(activeDataDir); err == nil {
		if err := os.Rename(activeDataDir, backupDataDir); err != nil {
			_ = os.RemoveAll(activeDataDir)
		}
	}

	if err := os.Rename(tmpDataDir, activeDataDir); err != nil {
		if _, bErr := os.Stat(backupDataDir); bErr == nil {
			_ = os.Rename(backupDataDir, activeDataDir)
		}
		return fmt.Errorf("atomic directory rename failed: %w", err)
	}

	_ = os.RemoveAll(backupDataDir)

	_ = os.WriteFile(filepath.Join(s.contentDir, "version"), []byte(info.Version+"\n"), 0o644)

	changesMap := map[string]interface{}{
		"version":      info.Version,
		"from_version": info.FromVersion,
		"changes":      info.Changes,
		"updatedAt":    info.PublishedAt,
	}
	if info.PublishedAt == "" {
		changesMap["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
	}
	changesBytes, _ := json.MarshalIndent(changesMap, "", "  ")
	_ = os.WriteFile(filepath.Join(s.contentDir, "changes.json"), append(changesBytes, '\n'), 0o644)

	s.lastETag = etag
	log.Printf("[content-sync] Successfully synced curriculum version %s in %v", info.Version, time.Since(start).Round(time.Millisecond))
	return nil
}

func extractTar(tr io.Reader, dest string) error {
	reader := tar.NewReader(tr)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		target := filepath.Join(dest, header.Name)
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, reader); err != nil {
				f.Close()
				return err
			}
			f.Close()
		}
	}
	return nil
}

func (s *Syncer) Run(stopCh <-chan struct{}) {
	log.Printf("[content-sync] Starting content-sync sidecar daemon...")
	log.Printf("[content-sync] CDN: %s", s.cdnURL)
	log.Printf("[content-sync] Content Directory: %s", s.contentDir)
	log.Printf("[content-sync] Check Interval: %v", s.interval)

	syncOnStart := strings.ToLower(os.Getenv("SYNC_ON_START")) != "false"
	if syncOnStart {
		if err := s.checkAndSync(); err != nil {
			log.Printf("[content-sync] Initial sync warning: %v", err)
		}
	}

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-stopCh:
			log.Printf("[content-sync] Stopping daemon cleanly...")
			return
		case <-ticker.C:
			if err := s.checkAndSync(); err != nil {
				log.Printf("[content-sync] Sync check error: %v", err)
			}
		}
	}
}

func main() {
	syncer := NewSyncer()

	stopCh := make(chan struct{})
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigCh
		close(stopCh)
	}()

	syncer.Run(stopCh)
}
