param(
    [string]$Region = "ap-south-1",
    [string]$RoleName = "labops-role-dev",
    [string]$PolicyName = "labops-ecr-publish-policy-dev"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Repos = @(
    "vmalani/labops-images",
    "vmalani/labops-images/orchestrator",
    "vmalani/labops-images/frontend",
    "vmalani/labops-images/content-sync",
    "vmalani/labops-images/lab-ubuntu",
    "vmalani/labops-images/lab-docker",
    "vmalani/labops-images/lab-docker-fundamentals",
    "vmalani/labops-images/lab-docker-build",
    "labops-orchestrator",
    "labops-frontend",
    "labops-content-sync",
    "labops-lab-ubuntu",
    "labops-lab-docker",
    "labops-lab-docker-fundamentals",
    "labops-lab-docker-build"
)

Write-Host "==> 1. Creating Amazon ECR Repositories in $Region..." -ForegroundColor Cyan

foreach ($repo in $Repos) {
    $exists = aws ecr describe-repositories --repository-names $repo --region $Region 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  - [✔] Repository '$repo' already exists." -ForegroundColor Green
    } else {
        Write-Host "  - [+] Creating repository '$repo'..." -ForegroundColor Yellow
        aws ecr create-repository `
            --repository-name $repo `
            --region $Region `
            --image-scanning-configuration scanOnPush=true `
            --encryption-configuration encryptionType=AES256 | Out-Null
    }
}

Write-Host ""
Write-Host "==> 2. Attaching IAM Inline Policy to Role '$RoleName'..." -ForegroundColor Cyan
$PolicyFile = Join-Path $ScriptDir "policy\ecr-publish-policy-dev.json"

if (Test-Path $PolicyFile) {
    aws iam put-role-policy `
        --role-name $RoleName `
        --policy-name $PolicyName `
        --policy-document "file://$PolicyFile"
    Write-Host "  - [✔] Successfully attached inline policy '$PolicyName' to IAM role '$RoleName'." -ForegroundColor Green
} else {
    Write-Host "  - [!] Error: Policy file $PolicyFile not found." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "SUCCESS: Amazon ECR Repositories & IAM Role configured!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
