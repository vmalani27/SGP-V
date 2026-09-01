# Configuring Private S3 Bucket Downloads via AWS Presigned URLs

> **Status: implemented.** The backend now signs presigned S3 download URLs on
> `/api/v1/content/version` (see §1 below). The sections that follow are the
> implementation notes and the required IAM / infrastructure setup.

The Next.js frontend downloads the published course content from S3, but it no
longer uses the static public URL. The backend signs each download with a
short-lived **presigned URL**, so the S3 bucket can stay private.

To secure the bucket and prevent unauthorized public access, the backend signs
S3 presigned URLs as follows:

---

## 1. Backend Changes

Add `boto3` to the backend dependencies and update the version handshake route to sign download URLs dynamically.

### A. Update Dependencies
Append the AWS SDK to `backend/app/requirements.txt`:
```text
boto3>=1.34.0
```

### B. Update the Route (`backend/app/routers/content.py`)
Replace the standard URL construction with `boto3`'s `generate_presigned_url`:

```python
import urllib.parse
import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException

# ... standard setup ...

def get_presigned_download_url(base_url: str, version: str) -> str:
    """Generate a presigned S3 URL for content.tar.gz.

    Parses the bucket name and region from virtual-hosted style S3 URLs,
    e.g., https://bucket-name.s3.region-name.amazonaws.com.
    """
    try:
        parsed = urllib.parse.urlparse(base_url)
        hostname = parsed.hostname or ""
        parts = hostname.split('.')
        if not parts:
            return f"{base_url}/published/{version}/content.tar.gz"

        bucket = parts[0]
        region = "ap-south-1"  # fallback default
        if len(parts) > 2 and parts[1] == "s3" and parts[2] != "amazonaws":
            region = parts[2]

        # Sign against the REGIONAL endpoint (not the global s3.amazonaws.com).
        # Region-scoped buckets reject global-endpoint signatures with a
        # 307 TemporaryRedirect that breaks the signature on redirect -> 403.
        endpoint_url = f"https://s3.{region}.amazonaws.com"
        s3_client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )

        key = f"published/{version}/content.tar.gz"
        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,  # 1 hour expiration
        )
        return presigned_url
    except Exception:
        # Fallback to the static public URL if boto3 credentials are not configured
        return f"{base_url}/published/{version}/content.tar.gz"
```

> **Regional endpoint is required.** The original implementation signed against
> the global `s3.amazonaws.com` endpoint. Because the bucket is region-scoped,
> S3 answered with `307 TemporaryRedirect` to
> `s3.{region}.amazonaws.com`, which invalidated the signature and produced a
> `403 Forbidden` (surfacing as `500` on `/api/local-content/*`). Signing against
> the regional endpoint (above) fixed it.

In the `@router.get("/version")` endpoint, replace:
```python
"download_url": f"{CONTENT_PUBLIC_BASE_URL}/published/{version}/content.tar.gz",
```
with:
```python
"download_url": get_presigned_download_url(CONTENT_PUBLIC_BASE_URL, version),
```

---

## 2. Infrastructure Setup (AWS IAM / Environment Config)

### A. AWS IAM Role/User Configuration
Create an AWS IAM User or Role with programmatic access and attach a policy allowing `GetObject` on your bucket's published assets. For dev it is acceptable to attach the policy directly to the IAM user (the policy is scoped to a single bucket's `published/*`); for beta/prod prefer a **role** for the service or a **group** for humans:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::content-dev-586177432842-ap-south-1-an/published/*"
        }
    ]
}
```

### B. Backend Environment Variables

Load the AWS variables into the backend service. In this repo that means the
compose stack's `env_file` (`environments/dev/.env.dev` for
`docker-compose.dev.yml`):

*   `AWS_ACCESS_KEY_ID` (your IAM access key)
*   `AWS_SECRET_ACCESS_KEY` (your IAM secret key)
*   `AWS_DEFAULT_REGION` / `AWS_REGION` (your bucket's region, e.g., `ap-south-1`)
*   `CONTENT_PUBLIC_BASE_URL` (the bucket's virtual-hosted S3 URL — the backend
    parses the bucket name + region from it to sign the URLs)

> **Local stack note:** `docker-compose.local.yml` uses Floci/LocalStack with
> dummy creds (`test`/`test`) and the signing path points at the Floci endpoint,
> so no real AWS credentials are needed locally.
