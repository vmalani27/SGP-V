# Lab 3: Staging Selectively — Clean Commits from a Messy Working Tree

## Scenario

You sit down Monday morning to find the repository in `/home/student/webapp` with three modified files from a late-night session: an authentication fix (`auth.py`), a CSS color update (`styles.css`), and temporary debug logging (`api.py`) that was never meant to be committed. All three modifications are sitting unstaged in the working tree.

Your goal is to produce a clean, atomic commit history where each logical change is recorded in its own commit, discard the temporary debug modifications, and push the resulting commits to the remote server.

## Objectives

- Inspect uncommitted modifications across the working tree
- Stage and commit `auth.py` and `styles.css` as separate, atomic commits
- Discard the uncommitted debug changes in `api.py`
- Synchronize your local `main` branch with `origin/main`

## Acceptance Criteria

| Requirement | Expected Outcome |
| :--- | :--- |
| `auth.py` committed alone | Recorded in its own dedicated commit |
| `styles.css` committed alone | Recorded in a separate commit from `auth.py` |
| `api.py` restored | Contains no uncommitted modifications and was not committed |
| Clean history | Three total commits exist on `main` (initial commit plus two atomic commits) |
| Remote synchronized | `origin/main` matches local `HEAD` |
