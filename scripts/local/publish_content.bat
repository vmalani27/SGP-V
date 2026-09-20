@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo [Content Publish] Publishing Course Content to Floci S3
echo =======================================================

set AWS_ACCESS_KEY_ID=test
set AWS_SECRET_ACCESS_KEY=test
set AWS_REGION=us-east-1
set AWS_DEFAULT_REGION=us-east-1
set AWS_ENDPOINT_URL=http://localhost:4566

echo [1/3] Validating content...
python scripts\validate_content.py content-v2\
if %errorlevel% neq 0 (
    echo [ERROR] Content validation failed!
    exit /b %errorlevel%
)

echo [2/3] Generating content manifest and archive...
python scripts\generate_manifest.py content-v2\ out\
if %errorlevel% neq 0 (
    echo [ERROR] Manifest generation failed!
    exit /b %errorlevel%
)

echo [3/3] Uploading content to S3 bucket...
aws s3 cp out\published\ s3://my-content-bucket/published/ --recursive
aws s3 cp out\latest.json s3://my-content-bucket/latest.json
aws s3 cp out\catalog.json s3://my-content-bucket/catalog.json

echo.
echo =======================================================
echo [DONE] Content and Catalog published directly to S3!
echo =======================================================
