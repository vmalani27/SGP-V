@echo off
setlocal EnableDelayedExpansion

echo ==================================================
echo LabOps: Pulling Images from Amazon ECR
echo ==================================================
echo.

set "TAG=dev"
if "%ECR_REGISTRY%"=="" (
    set "REGISTRY=public.ecr.aws/vmalani27"
) else (
    set "REGISTRY=%ECR_REGISTRY%"
)

echo [1/6] Pulling Frontend Service (%REGISTRY%/labops-frontend:%TAG%)...
docker pull %REGISTRY%/labops-frontend:%TAG%

echo.
echo [2/6] Pulling Orchestrator Service (%REGISTRY%/labops-orchestrator:%TAG%)...
docker pull %REGISTRY%/labops-orchestrator:%TAG%

echo.
echo [3/6] Pulling Base Ubuntu Lab Image (%REGISTRY%/labops-lab-ubuntu:%TAG%)...
docker pull %REGISTRY%/labops-lab-ubuntu:%TAG%
docker tag %REGISTRY%/labops-lab-ubuntu:%TAG% labops-ubuntu:latest
docker tag %REGISTRY%/labops-lab-ubuntu:%TAG% sgp-lab-ubuntu:latest

echo.
echo [4/6] Pulling Docker-in-Docker Lab Image (%REGISTRY%/labops-lab-docker:%TAG%)...
docker pull %REGISTRY%/labops-lab-docker:%TAG%
docker tag %REGISTRY%/labops-lab-docker:%TAG% labops-docker:latest
docker tag %REGISTRY%/labops-lab-docker:%TAG% sgp-lab-docker:latest

echo.
echo [5/6] Pulling Preloaded Fundamentals Lab Image (%REGISTRY%/labops-lab-docker-fundamentals:%TAG%)...
docker pull %REGISTRY%/labops-lab-docker-fundamentals:%TAG%
docker tag %REGISTRY%/labops-lab-docker-fundamentals:%TAG% labops-docker-fundamentals:latest
docker tag %REGISTRY%/labops-lab-docker-fundamentals:%TAG% sgp-lab-docker-fundamentals:latest

echo.
echo [6/6] Pulling Preloaded Docker Build Lab Image (%REGISTRY%/labops-lab-docker-build:%TAG%)...
docker pull %REGISTRY%/labops-lab-docker-build:%TAG%
docker tag %REGISTRY%/labops-lab-docker-build:%TAG% labops-docker-build:latest
docker tag %REGISTRY%/labops-lab-docker-build:%TAG% sgp-lab-docker-build:latest

echo.
echo ==================================================
echo SUCCESS: All LabOps services and lab images are ready!
echo ==================================================
pause
