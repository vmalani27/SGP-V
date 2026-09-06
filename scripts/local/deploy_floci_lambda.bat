@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo [LabOps Local Floci] Deploy Infrastructure and Content
echo =======================================================

call scripts\local\setup_floci_infra.bat
if %errorlevel% neq 0 (
    echo [ERROR] Infrastructure setup failed!
    exit /b %errorlevel%
)

call scripts\local\publish_content.bat
if %errorlevel% neq 0 (
    echo [ERROR] Content publish failed!
    exit /b %errorlevel%
)

echo.
echo =======================================================
echo [SUCCESS] Floci stack fully deployed and seeded!
echo =======================================================
