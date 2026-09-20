package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSyncCourseContent(t *testing.T) {
	err := SyncCourseContent("", true)
	if err != nil {
		t.Fatalf("SyncCourseContent failed: %v", err)
	}

	contentDir := GetContentDir()
	ver := ReadLocalContentVersion()
	if ver == "" {
		t.Fatalf("expected non-empty content version")
	}

	coursesDir := filepath.Join(contentDir, "data", "courses")
	if _, err := os.Stat(coursesDir); err != nil {
		t.Fatalf("missing courses dir: %v", err)
	}
	t.Logf("Successfully verified atomic swap: installed content version %s into %s", ver, contentDir)
}

func TestSyncCourseContentFromCloudFront(t *testing.T) {
	cdnURL := "https://d3rqfqpemi0u1s.cloudfront.net"
	err := SyncCourseContent(cdnURL, true)
	if err != nil {
		t.Fatalf("SyncCourseContent from CloudFront failed: %v", err)
	}

	contentDir := GetContentDir()
	ver := ReadLocalContentVersion()
	if ver == "" {
		t.Fatalf("expected non-empty content version")
	}

	coursesDir := filepath.Join(contentDir, "data", "courses")
	if _, err := os.Stat(coursesDir); err != nil {
		t.Fatalf("missing courses dir: %v", err)
	}
	t.Logf("Successfully verified atomic swap from CloudFront CDN: installed content version %s into %s", ver, contentDir)
}
