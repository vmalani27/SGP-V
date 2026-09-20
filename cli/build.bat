@echo off
setlocal enabledelayedexpansion

rem Always run from the directory of this script (cli folder)
cd /d "%~dp0"

rem Usage:
rem   build.bat               - build for current Windows host (default: labops-windows-amd64.exe)
rem   build.bat all           - cross-compile for Linux, macOS, Windows
rem   build.bat clean         - remove built binaries

set "ARG=%~1"
set "TARGET_ENV=dev"

if /I "%ARG%"=="clean" (
    echo Cleaning built binaries...
    del /f /q labops labops.exe labops-linux-amd64 labops-linux-arm64 labops-darwin-amd64 labops-darwin-arm64 labops-windows-amd64.exe labops-windows-arm64.exe 2>nul
    goto :end
)

if /I "%ARG%"=="all" (
    set "ALL_ENV=%~2"
    if "!ALL_ENV!"=="" set "ALL_ENV=dev"
    echo Building all target architectures for channel [!ALL_ENV!]...
    call :build_one linux amd64 labops-linux-amd64 !ALL_ENV!
    call :build_one linux arm64 labops-linux-arm64 !ALL_ENV!
    call :build_one darwin amd64 labops-darwin-amd64 !ALL_ENV!
    call :build_one darwin arm64 labops-darwin-arm64 !ALL_ENV!
    call :build_one windows amd64 labops-windows-amd64.exe !ALL_ENV!
    call :build_one windows arm64 labops-windows-arm64.exe !ALL_ENV!
    goto :end
)

if not "%ARG%"=="" (
    set "TARGET_ENV=%ARG%"
)

echo Building labops-windows-amd64.exe for Windows host [channel: %TARGET_ENV%]...
call :build_one windows amd64 labops-windows-amd64.exe %TARGET_ENV%
goto :end

rem ------------------------------------------------------------
rem Subroutine to compile for GOOS/GOARCH with embedded CDN URL
rem ------------------------------------------------------------
:build_one
set "GOOS=%1"
set "GOARCH=%2"
set "OUT=%3"
set "ENV_NAME=%4"

set "BUILD_CDN=https://d3rqfqpemi0u1s.cloudfront.net"
if not "%CONTENT_PUBLIC_BASE_URL%"=="" (
    set "BUILD_CDN=%CONTENT_PUBLIC_BASE_URL%"
)

echo Building %OUT% for %GOOS%/%GOARCH% [channel: %ENV_NAME%, cdn: %BUILD_CDN%]...
set "GOOS=%GOOS%"
set "GOARCH=%GOARCH%"
set "CGO_ENABLED=0"
go build -ldflags="-s -w -X main.defaultChannel=%ENV_NAME% -X main.defaultCDNURL=%BUILD_CDN%" -trimpath -o "%OUT%" .
if errorlevel 1 (
    echo [ERROR] Failed to build %OUT%
    exit /b 1
)
exit /b 0

:end
echo Build complete.
exit /b 0