@echo off
setlocal EnableDelayedExpansion

echo ==================================================
echo LabOps: Pulling Images from Amazon ECR Public
echo ==================================================
echo.

set "TAG=dev"
if "%ECR_REGISTRY%"=="" (
    set "REGISTRY=public.ecr.aws/i9t1l0m7"
) else (
    set "REGISTRY=%ECR_REGISTRY%"
)

echo [1/8] Pulling Frontend Service (%REGISTRY%/labops-frontend:%TAG%)...
docker pull %REGISTRY%/labops-frontend:%TAG%

echo.
echo [2/8] Pulling Orchestrator Service (%REGISTRY%/labops-orchestrator:%TAG%)...
docker pull %REGISTRY%/labops-orchestrator:%TAG%

echo.
echo [3/8] Pulling Content-Sync Service (%REGISTRY%/labops-content-sync:%TAG%)...
docker pull %REGISTRY%/labops-content-sync:%TAG%

echo.
echo [4/8] Pulling Base Ubuntu Lab Image (%REGISTRY%/labops-ubuntu:%TAG%)...
docker pull %REGISTRY%/labops-ubuntu:%TAG%
docker tag %REGISTRY%/labops-ubuntu:%TAG% labops-ubuntu:latest
docker tag %REGISTRY%/labops-ubuntu:%TAG% sgp-lab-ubuntu:latest

echo.
echo [5/8] Pulling Docker-in-Docker Lab Image (%REGISTRY%/labops-docker:%TAG%)...
docker pull %REGISTRY%/labops-docker:%TAG%
docker tag %REGISTRY%/labops-docker:%TAG% labops-docker:latest
docker tag %REGISTRY%/labops-docker:%TAG% sgp-lab-docker:latest

echo.
echo [6/8] Pulling Docker Fundamentals Lab Image (%REGISTRY%/labops-docker-fundamentals:%TAG%)...
docker pull %REGISTRY%/labops-docker-fundamentals:%TAG%
docker tag %REGISTRY%/labops-docker-fundamentals:%TAG% labops-docker-fundamentals:latest
docker tag %REGISTRY%/labops-docker-fundamentals:%TAG% sgp-lab-docker-fundamentals:latest

echo.
echo [7/8] Pulling Docker Build Lab Image (%REGISTRY%/labops-docker-build:%TAG%)...
docker pull %REGISTRY%/labops-docker-build:%TAG%
docker tag %REGISTRY%/labops-docker-build:%TAG% labops-docker-build:latest
docker tag %REGISTRY%/labops-docker-build:%TAG% sgp-lab-docker-build:latest

echo.
echo [8/8] Pulling Git Fundamentals Lab Image (%REGISTRY%/labops-git-fundamentals:%TAG%)...
docker pull %REGISTRY%/labops-git-fundamentals:%TAG%
docker tag %REGISTRY%/labops-git-fundamentals:%TAG% labops-git-fundamentals:latest
docker tag %REGISTRY%/labops-git-fundamentals:%TAG% sgp-lab-git-fundamentals:latest

echo.
echo ==================================================
echo SUCCESS: All LabOps public ECR images are ready!
echo ==================================================
pause
