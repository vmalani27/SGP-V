param (
    [string]$Region = "ap-south-1",
    [string]$AccountId = "586177432842",
    [string]$Tag = "runner-2.337.0"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Registry = "${AccountId}.dkr.ecr.${Region}.amazonaws.com"
$ImageName = "vmalani/labops-images"
$FullImage = "${Registry}/${ImageName}:${Tag}"

Write-Host "==> 1. Authenticating with Amazon ECR ($Region)..." -ForegroundColor Cyan
(aws ecr get-login-password --region $Region) | docker login --username AWS --password-stdin $Registry

Write-Host "==> 2. Building GitHub Actions Runner Image ($FullImage)..." -ForegroundColor Cyan
docker build -t $FullImage $ScriptDir

Write-Host "==> 3. Pushing Image to Amazon ECR..." -ForegroundColor Cyan
docker push $FullImage

Write-Host "==================================================" -ForegroundColor Green
Write-Host "SUCCESS: Runner Image pushed to Amazon ECR:" -ForegroundColor Green
Write-Host "         $FullImage" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
