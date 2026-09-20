@echo off
setlocal EnableDelayedExpansion

echo ==================================================
echo LabOps Boot Timer
echo ==================================================
echo Measuring the time it takes to boot the VM and verify
echo all internal services (frontend + orchestrator) are online.
echo ==================================================
echo.

:: Replace spaces in time with 0 (necessary for hours before 10 AM, e.g. " 9:30:00")
set "t_start=%time: =0%"
for /F "tokens=1-4 delims=:.," %%a in ("!t_start!") do (
    set /a "start_time=(((%%a*60)+1%%b-100)*60+1%%c-100)*100+1%%d-100"
)

:: Run the Go CLI start command
call cli\labops.exe start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] The boot process failed.
    pause
    exit /b 1
)

:: Capture end time
set "t_end=%time: =0%"
for /F "tokens=1-4 delims=:.," %%a in ("!t_end!") do (
    set /a "end_time=(((%%a*60)+1%%b-100)*60+1%%c-100)*100+1%%d-100"
)

:: Calculate elapsed time in centiseconds
set /a "elapsed=end_time-start_time"

:: Adjust if the calculation crossed midnight
if !elapsed! LSS 0 set /a "elapsed+=8640000"

:: Convert back to minutes and seconds
set /a "seconds=elapsed/100"
set /a "hundredths=elapsed%%100"
set /a "minutes=seconds/60"
set /a "seconds=seconds%%60"

:: Add leading zeros if needed
if !hundredths! LSS 10 set "hundredths=0!hundredths!"
if !seconds! LSS 10 set "seconds=0!seconds!"

echo.
echo ==================================================
echo SUCCESS: LabOps is fully online and ready!
echo Total Boot Time: !minutes!m !seconds!.!hundredths!s
echo ==================================================
pause
