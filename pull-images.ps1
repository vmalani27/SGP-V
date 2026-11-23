param (
    [string]$Tag = "dev",
    [string]$Registry = $env:ECR_REGISTRY
)

if (-not $Registry) {
    $Registry = "public.ecr.aws/i9t1l0m7"
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "LabOps: Pulling Images from Amazon ECR Public ($Tag)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$images = @(
    @{ Name = "Frontend Service"; Remote = "$Registry/labops-frontend:$Tag" },
    @{ Name = "Orchestrator Service"; Remote = "$Registry/labops-orchestrator:$Tag" },
    @{ Name = "Content-Sync Service"; Remote = "$Registry/labops-content-sync:$Tag" },
    @{ Name = "Base Ubuntu Lab Image"; Remote = "$Registry/labops-ubuntu:$Tag"; Aliases = @("labops-ubuntu:latest", "sgp-lab-ubuntu:latest") },
    @{ Name = "Docker-in-Docker Lab Image"; Remote = "$Registry/labops-docker:$Tag"; Aliases = @("labops-docker:latest", "sgp-lab-docker:latest") },
    @{ Name = "Docker Fundamentals Lab Image"; Remote = "$Registry/labops-docker-fundamentals:$Tag"; Aliases = @("labops-docker-fundamentals:latest", "sgp-lab-docker-fundamentals:latest") },
    @{ Name = "Docker Build Lab Image"; Remote = "$Registry/labops-docker-build:$Tag"; Aliases = @("labops-docker-build:latest", "sgp-lab-docker-build:latest") },
    @{ Name = "Git Fundamentals Lab Image"; Remote = "$Registry/labops-git-fundamentals:$Tag"; Aliases = @("labops-git-fundamentals:latest", "sgp-lab-git-fundamentals:latest") }
)

$step = 1
foreach ($img in $images) {
    Write-Host "[$step/$($images.Count)] Pulling $($img.Name) ($($img.Remote))..." -ForegroundColor Yellow
    docker pull $img.Remote

    if ($img.Aliases) {
        foreach ($alias in $img.Aliases) {
            Write-Host "   -> Tagging as $alias" -ForegroundColor Gray
            docker tag $img.Remote $alias
        }
    }
    Write-Host ""
    $step++
}

Write-Host "==================================================" -ForegroundColor Green
Write-Host "SUCCESS: All LabOps public ECR images are ready!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
