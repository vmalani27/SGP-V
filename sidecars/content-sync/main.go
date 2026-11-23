package main

import (
	"archive/tar"
	"encoding/json"
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
	CatalogURL     string          `json:"catalog_url,omitempty"`
}

type ReleaseContentMeta struct {
	Version        string `json:"version"`
	ArtifactSHA256 string `json:"artifact_sha256"`
	ArchiveURL     string `json:"archive_url"`
	CatalogURL     string `json:"catalog_url"`
}

type ReleaseManifest struct {
	Version     string             `json:"version"`
	Channel     string             `json:"channel"`
	PublishedAt string             `json:"published_at"`
	Content     ReleaseContentMeta `json:"content"`
}

type Syncer struct {
	cdnURL     string
	contentDir string
	interval   time.Duration
	client     *http.Client
	lastETag   string
}

var defaultCDNURL = "https://d3rqfqpemi0u1s.cloudfront.net"

func NewSyncer() *Syncer {
	cdnURL := strings.TrimRight(os.Getenv("CDN_URL"), "/")
	if cdnURL == "" {
		cdnURL = strings.TrimRight(os.Getenv("CONTENT_PUBLIC_BASE_URL"), "/")
	}
	if cdnURL == "" {
		cdnURL = strings.TrimRight(defaultCDNURL, "/")
	}

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
	log.Printf("[content-sync] Target CDN/S3 URL: %s", s.cdnURL)
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
