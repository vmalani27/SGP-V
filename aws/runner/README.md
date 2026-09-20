# Self-Hosted GitHub Actions Runner on AWS ECS Fargate

This directory contains the Dockerfile, entrypoint script, and build scripts for deploying a self-hosted GitHub Actions runner in AWS ECS Fargate or local Docker.

---

## 1. Store GitHub PAT in AWS SSM Parameter Store (Free Tier)

Run the following command to store your GitHub Personal Access Token (PAT) securely in SSM Parameter Store at zero cost:

```bash
aws ssm put-parameter \
  --name "/labops/github_pat" \
  --value "ghp_your_github_personal_access_token" \
  --type "SecureString" \
  --region "ap-south-1" \
  --overwrite
```

> **Note:** Make sure your PAT has the `repo` scope to request runner registration tokens.

---

## 2. Build & Push Runner Container Image to Amazon ECR

Run the automated script to build and push the runner container image:

**In PowerShell:**
```powershell
.\aws\runner\build-and-push.ps1
```

**In Bash:**
```bash
./aws/runner/build-and-push.sh
```

This tags and pushes the image as `586177432842.dkr.ecr.ap-south-1.amazonaws.com/vmalani/labops-images:runner-2.337.0`.

---

## 3. ECS Fargate Task Definition Snippet

In your ECS Task Definition, inject the SSM Parameter as an environment variable using native ECS secret resolution:

```json
{
  "containerDefinitions": [
    {
      "name": "github-actions-runner",
      "image": "586177432842.dkr.ecr.ap-south-1.amazonaws.com/vmalani/labops-images:runner-2.337.0",
      "essential": true,
      "environment": [
        { "name": "GITHUB_REPOSITORY", "value": "vmalani27/SGP-V" },
        { "name": "RUNNER_LABELS", "value": "self-hosted,aws,fargate,ap-south-1" }
      ],
      "secrets": [
        {
          "name": "GITHUB_PAT",
          "valueFrom": "arn:aws:ssm:ap-south-1:586177432842:parameter/labops/github_pat"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/labops-runner",
          "awslogs-region": "ap-south-1",
          "awslogs-stream-prefix": "runner"
        }
      }
    }
  ]
}
```

---

## Key Features

- **Automated Registration**: Automatically requests short-lived runner registration tokens from GitHub API on boot.
- **Graceful Cleanup**: Intercepts `SIGTERM` / `SIGINT` signals on container shutdown to automatically un-register the runner from GitHub.
- **Pre-installed Tooling**: Includes `git`, `curl`, `jq`, `python3`, `awscli`, and Docker CLI tools.
