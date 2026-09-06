$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

Write-Host "Building AWS Lambda deployment packages via Docker..."

# Clean up previous builds
Remove-Item -Force layer.zip -ErrorAction SilentlyContinue
Remove-Item -Force function.zip -ErrorAction SilentlyContinue

# Execute build & packaging inside Linux SAM container
docker run --rm -v "${ScriptDir}:/var/task" public.ecr.aws/sam/build-python3.12 python /var/task/docker_build.py

Write-Host "Done! layer.zip and function.zip created."
