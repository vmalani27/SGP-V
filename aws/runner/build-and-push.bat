@echo off
setlocal

set "Region=%~1"
if "%Region%"=="" set "Region=ap-south-1"

set "AccountId=%~2"
if "%AccountId%"=="" set "AccountId=586177432842"

set "Tag=%~3"
if "%Tag%"=="" set "Tag=runner-2.337.0"

set "ScriptDir=%~dp0"
if "%ScriptDir:~-1%"=="\" set "ScriptDir=%ScriptDir:~0,-1%"
set "Registry=%AccountId%.dkr.ecr.%Region%.amazonaws.com"
set "ImageName=vmalani27/labops-base"
set "FullImage=%Registry%/%ImageName%:%Tag%"

set "ErrorAction=0"

echo ^>^> 1. Authenticating with Amazon ECR (%Region%)...
aws ecr get-login-password --region "%Region%" | docker login --username AWS --password-stdin "%Registry%"
if errorlevel 1 goto :error

echo ^>^> 2. Building GitHub Actions Runner Image (%FullImage%)...
docker build -t "%FullImage%" "%ScriptDir%"
if errorlevel 1 goto :error

echo ^>^> 3. Pushing Image to Amazon ECR...
docker push "%FullImage%"
if errorlevel 1 goto :error

echo ==================================================
echo SUCCESS: Runner Image pushed to Amazon ECR:
echo          %FullImage%
echo ==================================================
goto :end

:error
echo.
echo ERROR: Runner image build or push failed.
set "ErrorAction=1"

:end
endlocal & exit /b %ErrorAction%
