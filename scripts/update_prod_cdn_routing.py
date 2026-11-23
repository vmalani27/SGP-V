import json
import subprocess
import sys

def main():
    print("[1/3] Updating S3 Bucket Policy for content-beta...")
    beta_bucket = "content-beta-586177432842-ap-south-1-an"
    beta_policy = {
        "Version": "2008-10-17",
        "Id": "PolicyForCloudFrontPrivateContentBeta",
        "Statement": [
            {
                "Sid": "AllowCloudFrontServicePrincipal",
                "Effect": "Allow",
                "Principal": {
                    "Service": "cloudfront.amazonaws.com"
                },
                "Action": "s3:GetObject",
                "Resource": f"arn:aws:s3:::{beta_bucket}/*",
                "Condition": {
                    "ArnLike": {
                        "AWS:SourceArn": [
                            "arn:aws:cloudfront::586177432842:distribution/E3URBAJHRZD48H",
                            "arn:aws:cloudfront::586177432842:distribution/E1CRT7BJZLLR3D"
                        ]
                    }
                }
            }
        ]
    }

    with open("aws/policy/s3-bucket-policy-beta.json", "w", encoding="utf-8") as f:
        json.dump(beta_policy, f, indent=2)

    res = subprocess.run([
        "aws", "s3api", "put-bucket-policy",
        "--bucket", beta_bucket,
        "--policy", "file://aws/policy/s3-bucket-policy-beta.json"
    ], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error updating beta bucket policy: {res.stderr}")
        return 1
    print("✓ Beta bucket policy updated to allow both Beta and Prod CloudFront distributions.")

    print("\n[2/3] Fetching latest Prod CloudFront config for E1CRT7BJZLLR3D...")
    res = subprocess.run([
        "aws", "cloudfront", "get-distribution-config",
        "--id", "E1CRT7BJZLLR3D"
    ], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error fetching dist config: {res.stderr}")
        return 1

    dist_data = json.loads(res.stdout)
    etag = dist_data["ETag"]
    config = dist_data["DistributionConfig"]

    # 1. Add Beta S3 Origin if not already present
    beta_origin_id = "content-beta-s3-origin"
    origins = config["Origins"]["Items"]
    if not any(o["Id"] == beta_origin_id for o in origins):
        beta_origin = {
            "Id": beta_origin_id,
            "DomainName": f"{beta_bucket}.s3.ap-south-1.amazonaws.com",
            "OriginPath": "",
            "CustomHeaders": {
                "Quantity": 0
            },
            "S3OriginConfig": {
                "OriginAccessIdentity": "",
                "OriginReadTimeout": 30
            },
            "ConnectionAttempts": 3,
            "ConnectionTimeout": 10,
            "OriginShield": {
                "Enabled": False
            },
            "OriginAccessControlId": "EBHGIKSFOU9JC"
        }
        origins.append(beta_origin)
        config["Origins"]["Quantity"] = len(origins)
        print(f"✓ Added origin: {beta_origin_id}")
    else:
        print(f"✓ Origin {beta_origin_id} already present.")

    # 2. Template for cache behavior based on DefaultCacheBehavior
    default_cb = config["DefaultCacheBehavior"]
    cache_policy_id = default_cb.get("CachePolicyId", "658327ea-f89d-4fab-a63d-7e88639e58f6")
    resp_headers_policy_id = default_cb.get("ResponseHeadersPolicyId", "e61eb60c-9c35-4d20-a928-2b84e02af89c")

    patterns = [
        "releases/beta.json",
        "releases/beta/*",
        "downloads/beta/*",
        "beta/*"
    ]

    cache_behaviors = []
    for pattern in patterns:
        cb = {
            "PathPattern": pattern,
            "TargetOriginId": beta_origin_id,
            "TrustedSigners": {
                "Enabled": False,
                "Quantity": 0
            },
            "TrustedKeyGroups": {
                "Enabled": False,
                "Quantity": 0
            },
            "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": {
                "Quantity": 2,
                "Items": ["HEAD", "GET"],
                "CachedMethods": {
                    "Quantity": 2,
                    "Items": ["HEAD", "GET"]
                }
            },
            "SmoothStreaming": False,
            "Compress": True,
            "LambdaFunctionAssociations": {
                "Quantity": 0
            },
            "FunctionAssociations": {
                "Quantity": 0
            },
            "FieldLevelEncryptionId": "",
            "CachePolicyId": cache_policy_id,
            "ResponseHeadersPolicyId": resp_headers_policy_id
        }
        cache_behaviors.append(cb)

    config["CacheBehaviors"] = {
        "Quantity": len(cache_behaviors),
        "Items": cache_behaviors
    }

    with open("aws/policy/prod-dist-config-updated.json", "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    print("\n[3/3] Updating Prod CloudFront Distribution E1CRT7BJZLLR3D...")
    res = subprocess.run([
        "aws", "cloudfront", "update-distribution",
        "--id", "E1CRT7BJZLLR3D",
        "--if-match", etag,
        "--distribution-config", "file://aws/policy/prod-dist-config-updated.json"
    ], capture_output=True, text=True)

    if res.returncode != 0:
        print(f"Error updating CloudFront distribution: {res.stderr}")
        return 1

    print("✓ Successfully updated CloudFront distribution E1CRT7BJZLLR3D with multi-channel beta routing!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
