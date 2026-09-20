param (
    [string]$Tag = "dev",
    [string]$Registry = $env:ECR_REGISTRY
)

if (-not $Registry) {
    $Registry = "public.ecr.aws/i9t1l0m7/vmalani27"
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "LabOps: Pulling Images from Amazon ECR Public ($Tag)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$images = @(
    @{ Name = "Frontend Service"; Remote = "$Registry/labops-frontend:$Tag"; Local = $null },
    @{ Name = "Orchestrator Service"; Remote = "$Registry/labops-orchestrator:$Tag"; Local = $null },
    @{ Name = "Base Ubuntu Lab Image"; Remote = "$Registry/labops-base:$Tag"; Aliases = @("labops-ubuntu:latest", "sgp-lab-ubuntu:latest") },
    @{ Name = "Docker-in-Docker Lab Image"; Remote = "$Registry/labops-labs:docker-$Tag"; Aliases = @("labops-docker:latest", "sgp-lab-docker:latest") },
    @{ Name = "Preloaded Fundamentals Lab Image"; Remote = "$Registry/labops-labs:docker-fundamentals-$Tag"; Aliases = @("labops-docker-fundamentals:latest", "sgp-lab-docker-fundamentals:latest") },
    @{ Name = "Preloaded Docker Build Lab Image"; Remote = "$Registry/labops-labs:docker-build-$Tag"; Aliases = @("labops-docker-build:latest", "sgp-lab-docker-build:latest") }
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
