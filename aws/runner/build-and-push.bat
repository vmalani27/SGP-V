@echo off
setlocal

set "Region=us-east-1"
set "Registry=public.ecr.aws/i9t1l0m7"
set "ImageName=vmalani27/labops-base"
set "Tag=runner-2.337.0"

set "ScriptDir=%~dp0"
if "%ScriptDir:~-1%"=="\" set "ScriptDir=%ScriptDir:~0,-1%"
set "FullImage=%Registry%/%ImageName%:%Tag%"
set "DockerConfig=%TEMP%\labops-docker-config-%RANDOM%%RANDOM%"
mkdir "%DockerConfig%" >nul 2>&1
if not exist "%DockerConfig%" goto :error
set "DOCKER_CONFIG=%DockerConfig%"

set "ErrorAction=0"

echo ^>^> 1. Authenticating with Amazon ECR (%Region%)...
aws ecr-public get-login-password --region "%Region%" | docker --config "%DockerConfig%" login --username AWS --password-stdin public.ecr.aws
if errorlevel 1 goto :error

echo ^>^> 2. Building GitHub Actions Runner Image (%FullImage%)...
docker --config "%DockerConfig%" build -t "%FullImage%" "%ScriptDir%"
if errorlevel 1 goto :error

echo ^>^> 3. Pushing Image to Amazon ECR...
docker --config "%DockerConfig%" push "%FullImage%"
if errorlevel 1 goto :error

echo ==================================================
echo SUCCESS: Runner Image pushed to Amazon ECR:
echo          %FullImage%
echo ==================================================
goto :cleanup

:error
echo.
echo ERROR: Runner image build or push failed.
set "ErrorAction=1"

:cleanup
if exist "%DockerConfig%" rd /s /q "%DockerConfig%" >nul 2>&1

:end
endlocal & exit /b %ErrorAction%
