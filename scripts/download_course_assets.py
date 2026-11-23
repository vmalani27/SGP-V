#!/usr/bin/env python3
"""Download authoritative diagrams for git-fundamentals and docker-mastery."""

import sys
import urllib.request
from pathlib import Path

GIT_TARGET = Path("content-v2/courses/git-fundamentals/assets")
DOCKER_TARGET = Path("content-v2/courses/docker-mastery/assets")

ASSETS = [
    # Git Fundamentals
    (GIT_TARGET, "snapshots.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/snapshots.svg"),
    (GIT_TARGET, "snapshots.png", "https://raw.githubusercontent.com/progit/progit2/main/images/snapshots.png"),
    (GIT_TARGET, "areas.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/areas.svg"),
    (GIT_TARGET, "areas.png", "https://raw.githubusercontent.com/progit/progit2/main/images/areas.png"),
    (GIT_TARGET, "reset-workflow.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/reset-workflow.svg"),
    (GIT_TARGET, "reset-start.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/reset-start.svg"),
    (GIT_TARGET, "lifecycle.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/lifecycle.svg"),
    (GIT_TARGET, "lifecycle.png", "https://raw.githubusercontent.com/progit/progit2/main/images/lifecycle.png"),
    (GIT_TARGET, "advance-testing.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/advance-testing.svg"),
    (GIT_TARGET, "basic-branching-6.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/basic-branching-6.svg"),
    (GIT_TARGET, "managed-team-flow.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/managed-team-flow.svg"),
    (GIT_TARGET, "basic-merging-1.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/basic-merging-1.svg"),
    (GIT_TARGET, "basic-merging-2.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/basic-merging-2.svg"),
    (GIT_TARGET, "remote-branches-2.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/remote-branches-2.svg"),
    (GIT_TARGET, "remote-branches-3.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/remote-branches-3.svg"),
    (GIT_TARGET, "lr-branches-1.svg", "https://raw.githubusercontent.com/progit/progit2/main/images/lr-branches-1.svg"),
    (GIT_TARGET, "git-merge-conflicts.svg", "https://wac-cdn.atlassian.com/dam/jcr:e9e8f623-6ec0-4a8d-b088-34857b29a6b9/01%20Merge%20conflicts%20-%20Standard%20conflict%20markers.svg?cdnVersion=2490"),
    (GIT_TARGET, "git-stash.svg", "https://wac-cdn.atlassian.com/dam/jcr:22509be1-3f11-477c-a111-2eb2818981df/01%20Stashing%20-%20Git%20stash%20concept.svg?cdnVersion=2490"),

    # Docker Mastery
    (DOCKER_TARGET, "container-layers.webp", "https://raw.githubusercontent.com/docker/docs/main/content/manuals/engine/storage/drivers/images/container-layers.webp"),
    (DOCKER_TARGET, "docker-architecture.webp", "https://raw.githubusercontent.com/docker/docs/main/content/get-started/images/docker-architecture.webp"),
    (DOCKER_TARGET, "docker_pipeline_flow.svg", "https://raw.githubusercontent.com/Ashukr321/Complete-Docker-Basic-to-Advanced/main/resources/docker_pipeline_flow.svg"),
    (DOCKER_TARGET, "overlay_constructs.webp", "https://raw.githubusercontent.com/docker/docs/main/content/manuals/engine/storage/drivers/images/overlay_constructs.webp"),
    (DOCKER_TARGET, "sharing-layers.webp", "https://raw.githubusercontent.com/docker/docs/main/content/manuals/engine/storage/drivers/images/sharing-layers.webp"),
    (DOCKER_TARGET, "container_image_layers.webp", "https://raw.githubusercontent.com/docker/docs/main/content/get-started/docker-concepts/building-images/images/container_image_layers.webp"),
    (DOCKER_TARGET, "container_image_layer_reuse.webp", "https://raw.githubusercontent.com/docker/docs/main/content/get-started/docker-concepts/building-images/images/container_image_layer_reuse.webp"),
    (DOCKER_TARGET, "docker_architecture_overview.svg", "https://raw.githubusercontent.com/Ashukr321/Complete-Docker-Basic-to-Advanced/main/resources/docker_architecture_overview.svg"),
    (DOCKER_TARGET, "cache-stack.svg", "https://raw.githubusercontent.com/docker/docs/main/content/manuals/build/images/cache-stack.svg"),
    (DOCKER_TARGET, "cache-stack-invalidated.png", "https://raw.githubusercontent.com/docker/docs/main/content/manuals/build/images/cache-stack-invalidated.png"),
    (DOCKER_TARGET, "published-ports.webp", "https://raw.githubusercontent.com/docker/docs/main/content/get-started/docker-concepts/running-containers/images/published-ports.webp"),
    (DOCKER_TARGET, "docker_network_types.svg", "https://raw.githubusercontent.com/Ashukr321/Complete-Docker-Basic-to-Advanced/main/resources/docker_network_types.svg"),
    (DOCKER_TARGET, "multi-container-apps.webp", "https://raw.githubusercontent.com/docker/docs/main/content/get-started/docker-concepts/running-containers/images/multi-container-apps.webp"),
    (DOCKER_TARGET, "docker_compose_network_internals.svg", "https://raw.githubusercontent.com/Ashukr321/Complete-Docker-Basic-to-Advanced/main/resources/docker_compose_network_internals.svg"),
    (DOCKER_TARGET, "volumes-shared-storage.webp", "https://raw.githubusercontent.com/docker/docs/main/content/manuals/engine/storage/images/volumes-shared-storage.webp"),
    (DOCKER_TARGET, "mounted-files.webp", "https://raw.githubusercontent.com/docker/docs/main/content/get-started/docker-concepts/running-containers/images/mounted-files.webp"),
    (DOCKER_TARGET, "docker_volume_types.svg", "https://raw.githubusercontent.com/Ashukr321/Complete-Docker-Basic-to-Advanced/main/resources/docker_volume_types.svg"),
]


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def download_all():
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LabOps-Asset-Downloader"}
    failed = []

    for target_dir, filename, url in ASSETS:
        target_dir.mkdir(parents=True, exist_ok=True)
        dest = target_dir / filename
        print(f"Downloading {filename} from {url[:60]}... -> {dest}")
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                if len(data) == 0:
                    raise ValueError("Received 0 bytes")
                dest.write_bytes(data)
                print(f"  [OK] Saved ({len(data):,} bytes)")
        except Exception as e:
            print(f"  [FAIL] {e}")
            failed.append((filename, url, str(e)))

    if failed:
        print(f"\nCompleted with {len(failed)} failure(s):")
        for fn, u, err in failed:
            print(f"  - {fn}: {err}")
        return 1

    print(f"\nAll {len(ASSETS)} assets successfully downloaded!")
    return 0


if __name__ == "__main__":
    sys.exit(download_all())
