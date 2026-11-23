package main

import (
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
	"path/filepath"
	"strings"
	"time"
)

// checkAndSync fetches the latest release manifest from the CDN/S3 bucket,
// validates the artifact, downloads the tarball, and atomically unpacks it into the content directory.
func (s *Syncer) checkAndSync() error {
	if s.cdnURL == "" {
		log.Printf("[content-sync] No CDN URL configured (CDN_URL is empty); skipping remote sync")
		return nil
	}

	channel := os.Getenv("LABOPS_CHANNEL")
	if channel == "" {
		channel = os.Getenv("CHANNEL")
	}
	if channel == "" {
		channel = "dev"
	}

	var etag string
	targetURL := fmt.Sprintf("%s/releases/%s.json", s.cdnURL, channel)
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	if s.lastETag != "" {
		req.Header.Set("If-None-Match", s.lastETag)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch release manifest: %w", err)
	}
	defer resp.Body.Close()

	// ── 1. Resilient 304 Handling ─────────────────────────────────────
	// If the server returns 304 Not Modified, verify the local content folder
	// actually exists on disk before trusting the cached ETag.
	if resp.StatusCode == http.StatusNotModified {
		currentVersion := s.readLocalVersion()
		coursesPath := filepath.Join(s.contentDir, "data", "courses")
		hasCourses := false
		if fi, cErr := os.Stat(coursesPath); cErr == nil && fi.IsDir() {
			hasCourses = true
		}
		if hasCourses && currentVersion != "" {
			log.Printf("[content-sync] HTTP 304: Content is up-to-date (ETag %s)", s.lastETag)
			return nil
		}
		log.Printf("[content-sync] HTTP 304 received but local content is missing; forcing full re-download")
		s.lastETag = ""
		req.Header.Del("If-None-Match")
		retryResp, retryErr := s.client.Do(req)
		if retryErr != nil {
			return fmt.Errorf("failed to re-fetch release manifest: %w", retryErr)
		}
		resp = retryResp
		defer resp.Body.Close()
	}

	// ── 2. Fallback to latest.json if channel manifest is 404 ───────────
	var info ContentVersionInfo
	if resp.StatusCode == http.StatusNotFound {
		targetURL = s.cdnURL + "/latest.json"
		fallbackReq, fErr := http.NewRequest("GET", targetURL, nil)
		if fErr == nil {
			if s.lastETag != "" {
				fallbackReq.Header.Set("If-None-Match", s.lastETag)
			}
			fResp, fDoErr := s.client.Do(fallbackReq)
			if fDoErr == nil {
				defer fResp.Body.Close()
				if fResp.StatusCode == http.StatusNotModified {
					log.Printf("[content-sync] HTTP 304: Content is up-to-date (ETag %s)", s.lastETag)
					return nil
				}
				if fResp.StatusCode == http.StatusOK {
					bodyBytes, _ := io.ReadAll(fResp.Body)
					_ = json.Unmarshal(bodyBytes, &info)
					etag = fResp.Header.Get("ETag")
				}
			}
		}
	} else if resp.StatusCode == http.StatusOK {
		etag = resp.Header.Get("ETag")
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read response body: %w", err)
		}

		var relManifest ReleaseManifest
		if err := json.Unmarshal(bodyBytes, &relManifest); err == nil && relManifest.Content.Version != "" {
			info = ContentVersionInfo{
				Version:        relManifest.Content.Version,
				ArtifactSHA256: relManifest.Content.ArtifactSHA256,
				PublishedAt:    relManifest.PublishedAt,
				DownloadURL:    relManifest.Content.ArchiveURL,
				CatalogURL:     relManifest.Content.CatalogURL,
			}
		} else {
			_ = json.Unmarshal(bodyBytes, &info)
		}
	} else {
		return fmt.Errorf("unexpected HTTP %d from %s", resp.StatusCode, targetURL)
	}

	if info.Version == "" || info.Version == "dev" || info.Version == "stable" {
		log.Printf("[content-sync] No valid content version found in manifest (%s); waiting for publisher...", info.Version)
		return nil
	}

	// ── 3. Check if already installed ─────────────────────────────────
	currentVersion := s.readLocalVersion()
	coursesPath := filepath.Join(s.contentDir, "data", "courses")
	hasCourses := false
	if fi, err := os.Stat(coursesPath); err == nil && fi.IsDir() {
		hasCourses = true
	}

	if currentVersion == info.Version && hasCourses {
		if etag != "" {
			s.lastETag = etag
		}
		log.Printf("[content-sync] Content is current (version %s)", currentVersion)
		return nil
	}

	log.Printf("[content-sync] New content version detected: %s (installed: '%s'). Starting download...", info.Version, currentVersion)
	start := time.Now()

	// ── 4. Resolve download URL (Relative or Absolute) ────────────────
	downloadURL := info.DownloadURL
	if downloadURL == "" {
		downloadURL = fmt.Sprintf("%s/published/%s/content.tar.gz", s.cdnURL, info.Version)
	} else if strings.HasPrefix(downloadURL, "/") {
		downloadURL = fmt.Sprintf("%s%s", s.cdnURL, downloadURL)
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

	// ── 5. Verify Checksum ────────────────────────────────────────────
	if info.ArtifactSHA256 != "" {
		hasher := sha256.New()
		hasher.Write(uncompressedTar)
		sum := hex.EncodeToString(hasher.Sum(nil))
		if !strings.HasPrefix(sum, info.ArtifactSHA256) && !strings.HasPrefix(info.ArtifactSHA256, sum[:16]) {
			return fmt.Errorf("checksum mismatch: expected %s, got %s", info.ArtifactSHA256, sum[:16])
		}
		log.Printf("[content-sync] Checksum verified: %s", sum[:16])
	}

	// ── 6. Extract into temporary directory ───────────────────────────
	tmpDataDir := filepath.Join(s.contentDir, fmt.Sprintf("data_tmp_%s_%d", info.Version, time.Now().UnixNano()))
	if err := os.MkdirAll(tmpDataDir, 0o755); err != nil {
		return fmt.Errorf("failed to create temp extraction dir: %w", err)
	}
	defer os.RemoveAll(tmpDataDir)

	if err := extractTar(bytes.NewReader(uncompressedTar), tmpDataDir); err != nil {
		return fmt.Errorf("failed to extract tar: %w", err)
	}

	// ── 7. Fetch and save catalog ─────────────────────────────────────
	catalogURL := info.CatalogURL
	if catalogURL == "" {
		catalogURL = s.cdnURL + "/catalog.json"
	} else if strings.HasPrefix(catalogURL, "/") {
		catalogURL = fmt.Sprintf("%s%s", s.cdnURL, catalogURL)
	}
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

	// ── 8. Atomic directory swap ──────────────────────────────────────
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

	// ── 9. Write version and changes records ──────────────────────────
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

	if etag != "" {
		s.lastETag = etag
	}
	log.Printf("[content-sync] Successfully synced curriculum version %s in %v", info.Version, time.Since(start).Round(time.Millisecond))
	return nil
}
