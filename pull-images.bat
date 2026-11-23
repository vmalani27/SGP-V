@echo off
setlocal EnableDelayedExpansion

echo ==================================================
echo LabOps: Pulling Images from Amazon ECR Public
echo ==================================================
echo.

set "TAG=dev"
if "%~1" neq "" set "TAG=%~1"

if "%ECR_REGISTRY%"=="" (
    set "REGISTRY=public.ecr.aws/i9t1l0m7"
) else (
    set "REGISTRY=%ECR_REGISTRY%"
)

echo [1/10] Pulling Frontend Service (%REGISTRY%/labops-frontend:%TAG%)...
docker pull %REGISTRY%/labops-frontend:%TAG%

echo.
echo [2/10] Pulling Orchestrator Service (%REGISTRY%/labops-orchestrator:%TAG%)...
docker pull %REGISTRY%/labops-orchestrator:%TAG%

echo.
echo [3/10] Pulling Content-Sync Service (%REGISTRY%/labops-content-sync:%TAG%)...
docker pull %REGISTRY%/labops-content-sync:%TAG%

echo.
echo [4/10] Pulling Proxy Service (%REGISTRY%/labops-proxy:%TAG%)...
docker pull %REGISTRY%/labops-proxy:%TAG%

echo.
echo [5/10] Pulling Git Server (%REGISTRY%/labops-git-server:latest)...
docker pull %REGISTRY%/labops-git-server:latest

echo.
echo [6/10] Pulling Base Ubuntu Lab Image (%REGISTRY%/labops-ubuntu:%TAG%)...
docker pull %REGISTRY%/labops-ubuntu:%TAG%
docker tag %REGISTRY%/labops-ubuntu:%TAG% labops-ubuntu:latest

echo.
echo [7/10] Pulling Docker-in-Docker Lab Image (%REGISTRY%/labops-docker:%TAG%)...
docker pull %REGISTRY%/labops-docker:%TAG%
docker tag %REGISTRY%/labops-docker:%TAG% labops-docker:latest

echo.
echo [8/10] Pulling Preloaded Fundamentals Lab Image (%REGISTRY%/labops-docker-fundamentals:%TAG%)...
docker pull %REGISTRY%/labops-docker-fundamentals:%TAG%
docker tag %REGISTRY%/labops-docker-fundamentals:%TAG% labops-docker-fundamentals:latest

echo.
echo [9/10] Pulling Preloaded Docker Build Lab Image (%REGISTRY%/labops-docker-build:%TAG%)...
docker pull %REGISTRY%/labops-docker-build:%TAG%
docker tag %REGISTRY%/labops-docker-build:%TAG% labops-docker-build:latest

echo.
echo [10/10] Pulling Preloaded Git Fundamentals Lab Image (%REGISTRY%/labops-git-fundamentals:%TAG%)...
docker pull %REGISTRY%/labops-git-fundamentals:%TAG%
docker tag %REGISTRY%/labops-git-fundamentals:%TAG% labops-git-fundamentals:latest

echo.
echo ==================================================
echo SUCCESS: All LabOps services and lab images are ready!
echo ==================================================
pause
