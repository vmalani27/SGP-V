# Lab 8: Merging and Resolving Conflicts

## Scenario

You maintain a backend service in `/home/student/service-repo`. Two feature branches are ready for integration into `main`:
1. `feature/logging`: Contains logging initialization. Because `main` has not advanced since this branch diverged, it can be integrated via a fast-forward merge.
2. `feature/timeout`: Updates service timeouts in `app.py`. Meanwhile, independent changes to worker scaling were committed to the same section of `app.py` on `main`. Integrating this branch produces a merge conflict that requires manual resolution.

## Objectives

- Fast-forward merge `feature/logging` into `main` and delete the merged branch.
- Initiate a merge of `feature/timeout` into `main` and inspect the conflicted state.
- Identify the conflict markers inside `app.py`.
- Resolve the collision by preserving both settings (`timeout = 30` and `workers = 4`).
- Stage the resolved file and finalize the merge commit.
- Clean up the merged `feature/timeout` branch reference.

## Acceptance Criteria Table

| Requirement | Verification Check |
| :--- | :--- |
| Fast-forward merge completed | Logging commit present in `main` history; feature branch removed |
| Conflict encountered | Repository enters active merge state (`.git/MERGE_HEAD` present) |
| Conflict resolved | Conflict markers removed; both configuration values present in `app.py` |
| Merge commit created | Latest commit on `main` has two parent commits |
| Feature branches cleaned up | `git branch` lists only `main` |
