# Lab 9: Collaborating with Remotes

## Scenario

You are joining a teammate on the `payment-service` project hosted at `http://git-server:3000/student/payment-service.git`. While you are working locally, your teammate pushes new configuration changes to `origin/main`.

Your goal is to clone the remote repository into `/home/student/payment-service`, fetch and inspect your teammate's incoming commit before merging it, commit your own update to `app.py`, and reconcile the diverged histories so both changes are published to `origin/main`.

## Objectives

- Clone an existing remote repository into `/home/student/payment-service`
- Fetch remote commits into `origin/main` without modifying your local `main` branch
- Inspect unmerged commits on `origin/main`
- Integrate diverged remote and local commits and push the combined history to `origin/main`

## Acceptance Criteria

| Requirement | Expected Outcome |
| :--- | :--- |
| Repository cloned | `/home/student/payment-service` is cloned from `http://git-server:3000/student/payment-service.git` |
| Remote updates fetched | `origin/main` reflects the teammate's incoming commit while local `main` remains untouched until merged |
| Local and remote changes integrated | `HEAD` contains both `RETRY_BACKOFF = 2` in `config.py` and `currency = "USD"` in `app.py` |
| Remote synchronized | `origin/main` matches local `HEAD` with a clean working tree |
