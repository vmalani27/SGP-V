@echo off
:: Run this script in your Command Prompt session to configure the AWS CLI
:: Usage: floci-env.bat

set AWS_ACCESS_KEY_ID=test
set AWS_SECRET_ACCESS_KEY=test
set AWS_REGION=us-east-1
set AWS_DEFAULT_REGION=us-east-1
set AWS_ENDPOINT_URL=http://localhost:4566

echo [OK] AWS CLI environment configured for Floci.
echo Endpoint: %AWS_ENDPOINT_URL%
echo You can now run standard AWS commands without passing --endpoint-url.
echo Example: aws s3 ls
