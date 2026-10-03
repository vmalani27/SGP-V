@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REGISTRY=%ECR_REGISTRY%"
if "%REGISTRY%"=="" set "REGISTRY=public.ecr.aws/i9t1l0m7"

set "TAG=%~1"
if "%TAG%"=="" set "TAG=dev"

set "DOCKER_CONFIG_DIR=%TEMP%\labops-docker-ecr-%RANDOM%"
mkdir "%DOCKER_CONFIG_DIR%" >nul 2>&1
if errorlevel 1 (
    echo Failed to create temporary Docker config directory.
    exit /b 1
)

for /f "delims=" %%P in ('aws ecr-public get-login-password --region us-east-1') do set "ECR_PASSWORD=%%P"
if not defined ECR_PASSWORD (
    echo Failed to obtain an ECR Public login token.
    rmdir /s /q "%DOCKER_CONFIG_DIR%" >nul 2>&1
    exit /b 1
)

for /f "delims=" %%A in ('powershell -NoProfile -Command "$s=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(('AWS:' + $env:ECR_PASSWORD))); Write-Output $s"') do set "ECR_AUTH=%%A"
>"%DOCKER_CONFIG_DIR%\config.json" echo {"auths":{"public.ecr.aws":{"auth":"%ECR_AUTH%"}}}
set "DOCKER_CONFIG=%DOCKER_CONFIG_DIR%"

call :pull_preloads
if errorlevel 1 goto :failed

call :build_and_push "labops-ubuntu:latest" "labops-ubuntu:%TAG%" "Dockerfile.ubuntu"
if errorlevel 1 goto :failed
call :build_and_push "labops-docker:latest" "labops-docker:%TAG%" "Dockerfile.docker"
if errorlevel 1 goto :failed
call :build_and_push "labops-docker-fundamentals:latest" "labops-docker-fundamentals:%TAG%" "Dockerfile.docker-fundamentals"
if errorlevel 1 goto :failed
call :build_and_push "labops-docker-build:latest" "labops-docker-build:%TAG%" "Dockerfile.docker-build"
if errorlevel 1 goto :failed
call :build_and_push "labops-git-fundamentals:latest" "labops-git-fundamentals:%TAG%" "Dockerfile.git-fundamentals"
if errorlevel 1 goto :failed

echo All images built and pushed successfully.
set "RESULT=0"
goto :cleanup

:pull_preloads
echo Pulling and saving preloads...
docker pull alpine:latest || exit /b 1
docker save alpine:latest -o preloads\alpine.tar || exit /b 1
docker pull nginx:alpine || exit /b 1
docker save nginx:alpine -o preloads\nginx.tar || exit /b 1
exit /b 0

:build_and_push
echo Building %~1...
docker build -t "%~1" -t "%REGISTRY%/%~2" -f "%~3" . || exit /b 1
docker push "%REGISTRY%/%~2" || exit /b 1
exit /b 0

:failed
echo Image build or push failed.
set "RESULT=1"
:cleanup
rmdir /s /q "%DOCKER_CONFIG_DIR%" >nul 2>&1
endlocal
exit /b %RESULT%
