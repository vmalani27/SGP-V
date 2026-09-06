@echo off
setlocal enabledelayedexpansion

rem Always run from the directory of this script (cli folder)
cd /d "%~dp0"

rem Usage:
rem   build.bat               - build for current Windows host (dev env)
rem   build.bat dev           - build for current Windows host with dev env
rem   build.bat prod          - build for current Windows host with prod env
rem   build.bat all           - cross-compile for Linux, macOS, Windows
rem   build.bat clean         - remove built binaries

set "ARG=%~1"
set "TARGET_ENV=dev"

if /I "%ARG%"=="clean" (
    echo Cleaning built binaries...
    del /f /q labops.exe labops-linux-amd64 labops-darwin-amd64 labops-windows-amd64.exe 2>nul
    goto :end
)

if /I "%ARG%"=="all" (
    call :build_one linux amd64 labops-linux-amd64 dev
    call :build_one darwin amd64 labops-darwin-amd64 dev
    call :build_one windows amd64 labops-windows-amd64.exe dev
    goto :end
)

if not "%ARG%"=="" (
    set "TARGET_ENV=%ARG%"
)

echo Building labops.exe for Windows host [env: %TARGET_ENV%]...
call :build_one windows amd64 labops.exe %TARGET_ENV%
goto :end

rem ------------------------------------------------------------
rem Subroutine to compile for GOOS/GOARCH with embedded env
rem ------------------------------------------------------------
:build_one
set "GOOS=%1"
set "GOARCH=%2"
set "OUT=%3"
set "ENV_NAME=%4"

echo Building %OUT% for %GOOS%/%GOARCH% [channel: %ENV_NAME%]...
set "GOOS=%GOOS%"
set "GOARCH=%GOARCH%"
go build -ldflags="-s -w -X main.defaultChannel=%ENV_NAME%" -trimpath -o "%OUT%" .
if errorlevel 1 (
    echo [ERROR] Failed to build %OUT%
    exit /b 1
)
exit /b 0

:end
echo Build complete.
exit /b 0