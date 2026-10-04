@echo off
setlocal enabledelayedexpansion

rem Always run from script directory (cli folder)
cd /d "%~dp0"

set "TARGET_ENV=%~1"
if "!TARGET_ENV!"=="" set "TARGET_ENV=dev"

set "BUILD_CDN=https://d3rqfqpemi0u1s.cloudfront.net"
if not "%CONTENT_PUBLIC_BASE_URL%"=="" set "BUILD_CDN=%CONTENT_PUBLIC_BASE_URL%"
if not "%CDN_URL%"=="" set "BUILD_CDN=%CDN_URL%"

set "BUILD_REGISTRY=public.ecr.aws/i9t1l0m7"
if not "%ECR_PUBLIC_REGISTRY%"=="" set "BUILD_REGISTRY=%ECR_PUBLIC_REGISTRY%"

echo Building labops for Linux amd64 [channel: !TARGET_ENV!, registry: !BUILD_REGISTRY!, cdn: !BUILD_CDN!]...

set "CGO_ENABLED=0"
set "GOOS=linux"
set "GOARCH=amd64"

go build -ldflags="-s -w -X main.defaultChannel=!TARGET_ENV! -X main.defaultRegistry=!BUILD_REGISTRY! -X main.defaultCDNURL=!BUILD_CDN!" -trimpath -o labops-linux .

if errorlevel 1 (
    echo [ERROR] Failed to build Linux binary 'labops-linux'
    exit /b 1
)

copy /y labops-linux labops >nul 2>&1

echo.
echo Build complete: cli/labops-linux (and cli/labops)
echo Output binary: d:\vanshmalanidata\Document\GitHub\SGP-V\cli\labops-linux
echo You can now copy or mount this binary into native Linux!
exit /b 0
