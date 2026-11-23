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
    @{ Name = "Frontend Service"; Remote = "$Registry/labops-frontend:$Tag"; Aliases = $null },
    @{ Name = "Orchestrator Service"; Remote = "$Registry/labops-orchestrator:$Tag"; Aliases = $null },
    @{ Name = "Content-Sync Service"; Remote = "$Registry/labops-content-sync:$Tag"; Aliases = $null },
    @{ Name = "Proxy Service"; Remote = "$Registry/labops-proxy:$Tag"; Aliases = $null },
    @{ Name = "Git Server Image"; Remote = "$Registry/labops-git-server:latest"; Aliases = $null },
    @{ Name = "Base Ubuntu Lab Image"; Remote = "$Registry/labops-ubuntu:$Tag"; Aliases = @("labops-ubuntu:latest") },
    @{ Name = "Docker-in-Docker Lab Image"; Remote = "$Registry/labops-docker:$Tag"; Aliases = @("labops-docker:latest") },
    @{ Name = "Preloaded Fundamentals Lab Image"; Remote = "$Registry/labops-docker-fundamentals:$Tag"; Aliases = @("labops-docker-fundamentals:latest") },
    @{ Name = "Preloaded Docker Build Lab Image"; Remote = "$Registry/labops-docker-build:$Tag"; Aliases = @("labops-docker-build:latest") },
    @{ Name = "Preloaded Git Fundamentals Lab Image"; Remote = "$Registry/labops-git-fundamentals:$Tag"; Aliases = @("labops-git-fundamentals:latest") }
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
Write-Host "SUCCESS: All LabOps services and lab images are ready!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
