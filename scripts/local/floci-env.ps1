# Run this script in your PowerShell session to configure the AWS CLI
# Usage: . .\floci-env.ps1
# (Note the dot and space before the script path to source it into the current session)

$env:AWS_ACCESS_KEY_ID="test"
$env:AWS_SECRET_ACCESS_KEY="test"
$env:AWS_REGION="us-east-1"
$env:AWS_DEFAULT_REGION="us-east-1"
$env:AWS_ENDPOINT_URL="http://localhost:4566"

Write-Host "✅ AWS CLI environment configured for Floci." -ForegroundColor Green
Write-Host "Endpoint: $env:AWS_ENDPOINT_URL" -ForegroundColor Cyan
Write-Host "You can now run standard AWS commands without passing --endpoint-url."
Write-Host "Example: aws s3 ls"
