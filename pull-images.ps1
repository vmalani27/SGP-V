param (
    [string]$Tag = "dev",
    [string]$Registry = "ghcr.io/vmalani27/sgp-v"
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "LabOps: Pulling Images from GitHub Container Registry ($Tag)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$images = @(
    @{ Name = "Backend Service"; Remote = "$Registry/backend:$Tag"; Local = $null },
    @{ Name = "Frontend Service"; Remote = "$Registry/frontend:$Tag"; Local = $null },
    @{ Name = "Orchestrator Service"; Remote = "$Registry/orchestrator:$Tag"; Local = $null },
    @{ Name = "Base Ubuntu Lab Image"; Remote = "$Registry/lab-ubuntu:$Tag"; Aliases = @("labops-ubuntu:latest", "sgp-lab-ubuntu:latest") },
    @{ Name = "Docker-in-Docker Lab Image"; Remote = "$Registry/lab-docker:$Tag"; Aliases = @("labops-docker:latest", "sgp-lab-docker:latest") },
    @{ Name = "Preloaded Fundamentals Lab Image"; Remote = "$Registry/lab-docker-fundamentals:$Tag"; Aliases = @("labops-docker-fundamentals:latest", "sgp-lab-docker-fundamentals:latest") }
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
