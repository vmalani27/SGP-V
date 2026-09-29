# Lab 8: Merging and Resolving Conflicts

## Scenario

You maintain a backend service in `/home/student/service-repo`. Two feature branches are ready for integration into `main`:
1. `feature/logging`: Contains logging initialization. Because no other commits landed on `main` after this branch was created, it can be merged directly via a fast-forward merge.
2. `feature/timeout`: Updates service timeouts in `app.py`. Meanwhile, a teammate committed new worker scaling settings to the same line in `app.py` on `main`. Merging this branch will trigger a merge conflict that you must resolve by combining both changes.

## What You'll Do

- Fast-forward merge `feature/logging` into `main` and delete the merged branch
- Merge `feature/timeout` into `main` and inspect the conflict state
- Identify the conflict markers inside `app.py`
- Manually resolve the collision by keeping both changes (`timeout = 30` and `workers = 4`)
- Stage the resolved file and commit the merge
- Clean up the merged `feature/timeout` branch

## Operational Specifications

### 1. Fast-Forward Merge
- On branch `main`, run `git merge feature/logging`.
- Verify the history advances linearly.
- Delete the merged branch using `git branch -d feature/logging`.

### 2. Trigger Conflict
- Attempt to merge `feature/timeout` while on `main`.
- Confirm `git status` reports `both modified: app.py`.

### 3. Resolve and Commit
- Remove all conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>> feature/timeout`).
- Ensure both `timeout = 30` and `workers = 4` are preserved in `app.py`.
- Stage `app.py` with `git add app.py` and commit with `git commit`.

### 4. Branch Cleanup
- Remove `feature/timeout` using `git branch -d feature/timeout`.

## Acceptance Criteria Table

| Requirement | Verification Check |
| :--- | :--- |
| Fast-forward merge completed | `git log --oneline` shows logging commit on main |
| Conflict encountered | Repository enters merge state (`MERGE_HEAD` present) |
| Conflict resolved | Conflict markers removed and both settings present in `app.py` |
| Merge commit created | Latest commit on `main` has two parent commits |
| Feature branches cleaned up | `git branch` lists only `main` |
