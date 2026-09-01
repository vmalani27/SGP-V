import json
import logging
import boto3
import urllib.parse
import tarfile
import io
import tempfile
from pathlib import Path
import firebase_admin
from firebase_admin import firestore, credentials

import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)


BUCKET_TO_ENV = {
    "content-dev-586177432842-ap-south-1-an": "DEV",
    "content-beta-586177432842-ap-south-1-an": "BETA",
    "content-prod-586177432842-ap-south-1-an": "PROD",
}

db_clients = {}

def get_firestore_client(env: str):
    if env in db_clients:
        return db_clients[env]

    env_var = f"FIREBASE_CREDS_JSON_{env}"
    creds_json = os.environ.get(env_var)

    if not creds_json:
        raise ValueError(
            f"Missing Lambda environment variable: {env_var}"
        )

    creds_dict = json.loads(creds_json)
    cred = credentials.Certificate(creds_dict)

    app = firebase_admin.initialize_app(
        cred,
        name=env
    )

    db_clients[env] = firestore.client(app=app)

    logger.info(
        "Initialized Firebase Admin for environment: %s",
        env
    )

    return db_clients[env]

def get_s3_json(s3, bucket: str, key: str) -> dict:
    response = s3.get_object(Bucket=bucket, Key=key)
    return json.loads(response["Body"].read().decode("utf-8"))

def lambda_handler(event, context):
    logger.info("Received event: %s", json.dumps(event))
    
    try:
        record = event["Records"][0]
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record['s3']['object']['key'])
    except KeyError:
        logger.error("Invalid event structure")
        return {"statusCode": 400, "body": "Invalid event structure"}

    env = BUCKET_TO_ENV.get(bucket)

    if not env:
            logger.error("Unknown s3 bucket: %s", bucket)
            return {"statusCode": 400, "body": "Unknown S3 bucket"}

    logger.info("S3 bucket %s mapped to environment %s", bucket, env)

    if not key.endswith("latest.json"):
        logger.info(f"Ignoring event for key: {key}")
        return {"statusCode": 200, "body": "Ignored"}

    s3 = boto3.client("s3")
    
    logger.info("Fetching latest.json from bucket: %s", bucket)
    latest = get_s3_json(s3, bucket, "latest.json")
    version = latest.get("version")
    
    if not version:
        raise ValueError("latest.json is missing 'version' field")

    # Download content.tar.gz and extract to /tmp
    tar_key = f"published/{version}/content.tar.gz"
    logger.info("Downloading content tarball: %s", tar_key)
    tar_obj = s3.get_object(Bucket=bucket, Key=tar_key)
    tar_bytes = tar_obj["Body"].read()
    
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:*") as tar:
            # We use filter='data' in Python 3.12+ for safe extraction
            tar.extractall(path=tmp_path, filter='data')
            
        logger.info("Extracted content to %s. Syncing courses...", tmp_path)
        
        # Import the domain logic from seeder.py
        from seeder import sync_courses
        
        db = get_firestore_client(env=env)
        result = sync_courses(db, content_dir=tmp_path, content_version=version)
        
        logger.info("Sync complete. Result: %s", result)

    return {
        "statusCode": 200,
        "version": version,
        "result": result,
        "environment": env
    }
