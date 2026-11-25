#!/usr/bin/env python3
"""Manage LabOps OCI Image Registry State via AWS DynamoDB.

This script manages image metadata (tags, digests, commit SHAs) across DynamoDB tables,
allowing CI pipelines to skip building unchanged images and generate release manifests directly
from DynamoDB without any hardcoded values or fallbacks.

Required Environment Variables:
  DYNAMODB_REGION: AWS region for DynamoDB (e.g., ap-south-1)
  DYNAMODB_TABLE_APPS: DynamoDB table name for application images
  DYNAMODB_TABLE_LABS: DynamoDB table name for lab images
  DYNAMODB_TABLE_BASE_IMAGES: DynamoDB table name for base images
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
import boto3
from boto3.dynamodb.conditions import Key


def get_required_env(name: str) -> str:
    val = os.getenv(name, "").strip()
    if not val:
        raise ValueError(f"Required environment variable '{name}' is not set.")
    return val


def get_dynamodb_resource():
    region = get_required_env("DYNAMODB_REGION")
    return boto3.resource("dynamodb", region_name=region)


def is_composite_key(table) -> bool:
    """Check if the DynamoDB table has a composite key (HASH + RANGE)."""
    return any(k["KeyType"] == "RANGE" for k in table.key_schema)


def check_missing(slug: str | None) -> dict:
    """Check which images are missing from DynamoDB for the current slug/environment.
    
    Returns a dict: { "image_name": is_present (bool) }
    """
    ddb = get_dynamodb_resource()
    table_apps = ddb.Table(get_required_env("DYNAMODB_TABLE_APPS"))
    table_labs = ddb.Table(get_required_env("DYNAMODB_TABLE_LABS"))

    expected_apps = ["frontend", "orchestrator", "content-sync", "proxy"]
    expected_labs = [
        "labops-ubuntu",
        "labops-docker",
        "labops-docker-fundamentals",
        "labops-docker-build",
        "labops-git-fundamentals",
    ]

    status = {}

    # Check Apps
    if is_composite_key(table_apps):
        if not slug:
            raise ValueError("Branch slug is required for tables with composite keys.")
        for app in expected_apps:
            res = table_apps.get_item(Key={"branch_slug": slug, "image_name": app})
            status[app] = "Item" in res
    else:
        for app in expected_apps:
            res = table_apps.get_item(Key={"image_name": app})
            status[app] = "Item" in res

    # Check Labs
    if is_composite_key(table_labs):
        if not slug:
            raise ValueError("Branch slug is required for tables with composite keys.")
        for lab in expected_labs:
            res = table_labs.get_item(Key={"branch_slug": slug, "image_name": lab})
            status[lab] = "Item" in res
    else:
        for lab in expected_labs:
            res = table_labs.get_item(Key={"image_name": lab})
            status[lab] = "Item" in res

    return status


def record_image(
    category: str,
    name: str,
    remote: str,
    digest: str,
    commit_sha: str,
    slug: str | None = None,
    alias: str | None = None,
):
    """Record an image build result into DynamoDB."""
    ddb = get_dynamodb_resource()
    if category == "app":
        table = ddb.Table(get_required_env("DYNAMODB_TABLE_APPS"))
    elif category == "lab":
        table = ddb.Table(get_required_env("DYNAMODB_TABLE_LABS"))
    elif category == "base":
        table = ddb.Table(get_required_env("DYNAMODB_TABLE_BASE_IMAGES"))
    else:
        raise ValueError(f"Unknown category: {category}. Must be 'app', 'lab', or 'base'.")

    now_iso = datetime.now(timezone.utc).isoformat()
    if not digest.startswith("sha256:"):
        digest = f"sha256:{digest}"

    item = {
        "remote": remote,
        "image_digest": digest,
        "git_commit_sha": commit_sha,
        "updated_at": now_iso,
    }
    if alias:
        item["alias"] = alias

    if is_composite_key(table):
        if not slug:
            raise ValueError(f"Table '{table.name}' requires a branch slug for composite key.")
        item["branch_slug"] = slug
        item["image_name"] = name
    else:
        item["image_name"] = name

    table.put_item(Item=item)
    print(f"Recorded {category} image '{name}' into {table.name}: {digest}")


def export_manifest(slug: str | None, output_file: str):
    """Query DynamoDB and compile the images.json manifest."""
    ddb = get_dynamodb_resource()
    table_apps = ddb.Table(get_required_env("DYNAMODB_TABLE_APPS"))
    table_labs = ddb.Table(get_required_env("DYNAMODB_TABLE_LABS"))
    table_base = ddb.Table(get_required_env("DYNAMODB_TABLE_BASE_IMAGES"))

    images_manifest = {}

    # 1. Base Images: git-server
    res_git = table_base.get_item(Key={"image_name": "labops-git-server"})
    if "Item" in res_git:
        item = res_git["Item"]
        images_manifest["git-server"] = {
            "remote": item.get("image_tag", item.get("remote", "")),
            "digest": item.get("image_digest", ""),
        }

    # 2. Apps
    if is_composite_key(table_apps):
        if not slug:
            raise ValueError("Branch slug required to export composite app table.")
        res_apps = table_apps.query(KeyConditionExpression=Key("branch_slug").eq(slug))
        app_items = res_apps.get("Items", [])
    else:
        res_apps = table_apps.scan()
        app_items = res_apps.get("Items", [])

    for item in app_items:
        key = item["image_name"]
        images_manifest[key] = {
            "remote": item["remote"],
            "digest": item["image_digest"],
        }
        if "alias" in item:
            images_manifest[key]["alias"] = item["alias"]

    # 3. Labs
    if is_composite_key(table_labs):
        if not slug:
            raise ValueError("Branch slug required to export composite labs table.")
        res_labs = table_labs.query(KeyConditionExpression=Key("branch_slug").eq(slug))
        lab_items = res_labs.get("Items", [])
    else:
        res_labs = table_labs.scan()
        lab_items = res_labs.get("Items", [])

    for item in lab_items:
        key = item["image_name"]
        images_manifest[key] = {
            "remote": item["remote"],
            "digest": item["image_digest"],
        }
        if "alias" in item:
            images_manifest[key]["alias"] = item["alias"]

    Path(output_file).parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(images_manifest, f, indent=2)

    print(f"Exported images manifest ({len(images_manifest)} images) to {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Manage LabOps Image Registry via DynamoDB")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # Subcommand: check-missing
    p_check = subparsers.add_parser("check-missing", help="Check for missing images in DynamoDB")
    p_check.add_argument("--slug", default=None, help="Branch slug for composite tables")

    # Subcommand: record
    p_rec = subparsers.add_parser("record", help="Record a built image into DynamoDB")
    p_rec.add_argument("--category", required=True, choices=["app", "lab", "base"], help="Image category")
    p_rec.add_argument("--name", required=True, help="Image name (e.g., frontend, labops-docker)")
    p_rec.add_argument("--remote", required=True, help="Full remote image URI with tag")
    p_rec.add_argument("--digest", required=True, help="Image digest sha256:...")
    p_rec.add_argument("--commit", required=True, help="Git commit SHA")
    p_rec.add_argument("--slug", default=None, help="Branch slug for composite tables")
    p_rec.add_argument("--alias", default=None, help="Optional image alias (e.g., labops-ubuntu:latest)")

    # Subcommand: export-manifest
    p_exp = subparsers.add_parser("export-manifest", help="Export images.json from DynamoDB")
    p_exp.add_argument("--slug", default=None, help="Branch slug for composite tables")
    p_exp.add_argument("--output", default="images.json", help="Output path for images.json")

    args = parser.parse_args()

    try:
        if args.action == "check-missing":
            res = check_missing(args.slug)
            print(json.dumps(res, indent=2))
        elif args.action == "record":
            record_image(
                category=args.category,
                name=args.name,
                remote=args.remote,
                digest=args.digest,
                commit_sha=args.commit,
                slug=args.slug,
                alias=args.alias,
            )
        elif args.action == "export-manifest":
            export_manifest(args.slug, args.output)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
