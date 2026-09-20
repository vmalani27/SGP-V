#!/usr/bin/env bash
set -e

# build.sh – Helper script to compile the LabOps CLI binary.
# Usage:
#   ./build.sh            # Build for the current OS/architecture
#   ./build.sh all        # Build binaries for common target platforms
#   ./build.sh clean      # Remove previously built binaries

# Directory containing the Go source (this script resides in the cli folder)
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$ROOT_DIR"

# Function to build a binary for a specific GOOS and GOARCH
build() {
    local goos=$1
    local goarch=$2
    local output_name=$3
    local env_name=${4:-dev}
    local cdn_url=${CONTENT_PUBLIC_BASE_URL:-https://d3rqfqpemi0u1s.cloudfront.net}
    echo "Building $output_name for $goos/$goarch [channel: $env_name, cdn: $cdn_url]..."
    CGO_ENABLED=0 GOOS=$goos GOARCH=$goarch go build -ldflags="-s -w -X main.defaultChannel=$env_name -X main.defaultCDNURL=$cdn_url" -trimpath -o "$output_name" .
}

case "$1" in
    all)
        target_env="${2:-dev}"
        build linux amd64 labops-linux-amd64 "$target_env"
        build linux arm64 labops-linux-arm64 "$target_env"
        build darwin amd64 labops-darwin-amd64 "$target_env"
        build darwin arm64 labops-darwin-arm64 "$target_env"
        build windows amd64 labops-windows-amd64.exe "$target_env"
        build windows arm64 labops-windows-arm64.exe "$target_env"
        ;;
    clean)
        echo "Cleaning built binaries..."
        rm -f labops labops.exe labops-linux-amd64 labops-linux-arm64 labops-darwin-amd64 labops-darwin-arm64 labops-windows-amd64.exe labops-windows-arm64.exe
        ;;
    *)
        target_env="${1:-dev}"
        output="labops"
        if [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* ]]; then
            output="labops.exe"
        fi
        echo "Building $output for current platform [channel: $target_env]..."
        build "" "" "$output" "$target_env"
        ;;
esac

echo "Build complete."
