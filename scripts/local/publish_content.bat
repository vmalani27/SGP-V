@echo off
setlocal

echo =======================================================
echo [Content Publish] Publishing Course Content to Floci S3
echo =======================================================

set "ROOT=%~dp0..\.."
pushd "%ROOT%"

if exist "environments\local\.env.local" (
    set "ENV_FILE=environments/local/.env.local"
) else (
    set "ENV_FILE=environments/local/.env.local.sample"
    echo [INFO] environments/local/.env.local not found; using the checked-in sample.
)

docker compose --env-file "%ENV_FILE%" -f docker-compose.local.yml --profile publish run --rm content-publish
set "EXIT_CODE=%errorlevel%"
popd

echo.
if "%EXIT_CODE%"=="0" (
    echo =======================================================
    echo [DONE] Content and Catalog published directly to Floci!
    echo =======================================================
) else (
    echo [ERROR] Local content publish failed with exit code %EXIT_CODE%.
)
exit /b %EXIT_CODE%
