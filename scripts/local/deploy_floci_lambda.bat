@echo off
setlocal enabledelayedexpansion

echo [1/5] Setting up local Floci environment variables...
set AWS_ACCESS_KEY_ID=test
set AWS_SECRET_ACCESS_KEY=test
set AWS_REGION=us-east-1
set AWS_DEFAULT_REGION=us-east-1
set AWS_ENDPOINT_URL=http://localhost:4566

echo Checking if Lambda 'labops-worker' already exists...
aws lambda get-function --function-name labops-worker >nul 2>&1
if %errorlevel% equ 0 (
    echo [SKIPPING] Lambda already exists! Skipping infrastructure deployment.
    goto :content_sync
)

echo [2/5] Creating S3 bucket 'my-content-bucket'...
aws s3 mb s3://my-content-bucket --region us-east-1 >nul 2>&1

echo [3/5] Building Lambda packages (this requires Docker)...
cd worker
powershell.exe -ExecutionPolicy Bypass -File build.ps1
cd ..

echo [4/5] Creating IAM Role for Lambda...
aws iam create-role --role-name lambda-ex --assume-role-policy-document "{\"Version\": \"2012-10-17\",\"Statement\": [{ \"Action\": \"sts:AssumeRole\", \"Principal\": {\"Service\": \"lambda.amazonaws.com\"}, \"Effect\": \"Allow\", \"Sid\": \"\"}]}" >nul 2>&1

echo [5/5] Publishing Lambda Layer...
FOR /F "tokens=*" %%i IN ('aws lambda publish-layer-version --layer-name labops-worker-layer --zip-file fileb://worker/layer.zip --compatible-runtimes python3.12 --query LayerVersionArn --output text') DO set LAYER_ARN=%%i
echo    Layer ARN: !LAYER_ARN!

echo Creating Lambda Function 'labops-worker'...
:: Safely construct the AWS CLI environment JSON using Python to avoid batch string escaping hell
python -c "import json; creds = open('environments/dev/firebase/FIREBASE_CREDS_JSON_DEV.json', 'r', encoding='utf-8').read(); env = {'Variables': {'FIREBASE_PROJECT_ID': 'sgp-v-526af', 'CONTENT_DIR_S3': '/tmp/content', 'FIREBASE_CREDENTIALS_JSON': creds}}; open('lambda_env.json', 'w', encoding='utf-8').write(json.dumps(env))"

aws lambda create-function ^
    --function-name labops-worker ^
    --zip-file fileb://worker/function.zip ^
    --handler lambda_function.lambda_handler ^
    --runtime python3.12 ^
    --role arn:aws:iam::000000000000:role/lambda-ex ^
    --layers !LAYER_ARN! ^
    --timeout 30 ^
    --environment file://lambda_env.json

del lambda_env.json

echo Configuring S3 Bucket Notification to trigger Lambda...
echo { "LambdaFunctionConfigurations": [ { "LambdaFunctionArn": "arn:aws:lambda:us-east-1:000000000000:function:labops-worker", "Events": ["s3:ObjectCreated:*"], "Filter": { "Key": { "FilterRules": [ { "Name": "suffix", "Value": "latest.json" } ] } } } ] } > s3-notif.json
aws s3api put-bucket-notification-configuration --bucket my-content-bucket --notification-configuration file://s3-notif.json
del s3-notif.json

:content_sync
echo [SYNC] Validating and Generating Content Manifest...
python scripts/validate_content.py content-v2/
python scripts/generate_manifest.py content-v2/ out/

echo [SYNC] Uploading published content to Floci S3 (This will trigger the Lambda!)...
aws s3 cp out/published/ s3://my-content-bucket/published/ --recursive
aws s3 cp out/latest.json s3://my-content-bucket/latest.json

echo.
echo =======================================================
echo DONE! Floci S3 is seeded, and Lambda should have fired.
echo =======================================================
echo To view the Lambda logs in Floci, run: docker logs floci
echo To invoke it manually with a test event:
echo aws lambda invoke --function-name labops-worker --payload "{\"Records\": [{\"s3\": {\"bucket\": {\"name\": \"my-content-bucket\"}, \"object\": {\"key\": \"latest.json\"}}}]}" response.json --cli-binary-format raw-in-base64-out
