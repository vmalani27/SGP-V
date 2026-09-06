@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo [Floci Setup] Initializing Local S3 and Lambda Worker
echo =======================================================

echo [1/4] Setting Floci AWS environment variables...
set AWS_ACCESS_KEY_ID=test
set AWS_SECRET_ACCESS_KEY=test
set AWS_REGION=us-east-1
set AWS_DEFAULT_REGION=us-east-1
set AWS_ENDPOINT_URL=http://localhost:4566

echo [2/4] Ensuring S3 bucket 'my-content-bucket' exists...
aws s3 mb s3://my-content-bucket --region us-east-1 >nul 2>&1

echo [3/4] Building Lambda deployment package via Docker...
powershell.exe -ExecutionPolicy Bypass -File worker\build.ps1

echo [4/4] Deploying IAM role and Lambda function 'labops-worker'...
aws iam create-role --role-name lambda-ex --assume-role-policy-document "{\"Version\": \"2012-10-17\",\"Statement\": [{ \"Action\": \"sts:AssumeRole\", \"Principal\": {\"Service\": \"lambda.amazonaws.com\"}, \"Effect\": \"Allow\", \"Sid\": \"\"}]}" >nul 2>&1

aws lambda delete-function --function-name labops-worker >nul 2>&1

:: Upload function package to S3
aws s3 cp worker\function.zip s3://my-content-bucket/lambda/function.zip

:: Construct JSON environment file with dev credentials
python -c "import json; creds = open('environments/dev/firebase/FIREBASE_CREDS_JSON_DEV.json', 'r', encoding='utf-8').read(); env = {'Variables': {'FIREBASE_PROJECT_ID': 'sgp-v-526af', 'CONTENT_DIR_S3': '/tmp/content', 'FIREBASE_CREDENTIALS_JSON': creds, 'FIREBASE_CREDS_JSON_DEV': creds}}; open('lambda_env.json', 'w', encoding='utf-8').write(json.dumps(env))"

aws lambda create-function ^
    --function-name labops-worker ^
    --code S3Bucket=my-content-bucket,S3Key=lambda/function.zip ^
    --handler lambda_function.lambda_handler ^
    --runtime python3.12 ^
    --role arn:aws:iam::000000000000:role/lambda-ex ^
    --timeout 30 ^
    --environment file://lambda_env.json

del lambda_env.json

echo Configuring S3 Bucket Notification for latest.json...
echo { "LambdaFunctionConfigurations": [ { "LambdaFunctionArn": "arn:aws:lambda:us-east-1:000000000000:function:labops-worker", "Events": ["s3:ObjectCreated:*"], "Filter": { "Key": { "FilterRules": [ { "Name": "suffix", "Value": "latest.json" } ] } } } ] } > s3-notif.json
aws s3api put-bucket-notification-configuration --bucket my-content-bucket --notification-configuration file://s3-notif.json
del s3-notif.json

echo.
echo =======================================================
echo [DONE] Floci S3 and Lambda Worker infrastructure ready!
echo Next: Run 'scripts\local\publish_content.bat' to publish.
echo =======================================================
