# Lab 5: Keeping Unwanted Files Out with .gitignore

## Scenario

Your application directory contains sensitive configuration files (`.env`, `.env.local`) and compiled Python artifacts (`app.pyc`, `__pycache__/`). If anyone runs `git add .`, these files will be added to Git history and potentially leaked or cause merge conflicts.

In this lab, you will configure `.gitignore` to prevent these files from being tracked, inspect ignored files using Git flags, and safely untrack an already-committed file using `git rm --cached`.

## What You'll Do

- Observe untracked files with `git status`
- Create `.gitignore` to ignore `.env`, `.env.*`, `*.pyc`, and `__pycache__/`
- Verify that ignored files are filtered out from default status and visible via `git status --ignored`
- Use `git rm --cached` to stop tracking a committed file without deleting it from disk

## Operational Specifications

### 1. Identify Untracked Sensitive/Artifact Files
- Run `git status` in `/home/student/webapp` to see the uncommitted files.

### 2. Configure .gitignore
- Add entries for `.env`, `.env.*`, `*.pyc`, and `__pycache__/` to `.gitignore`.
- Verify that `git status` only reports `.gitignore` as an untracked file.

### 3. Check Ignored Files
- Run `git status --ignored` to confirm that the unwanted files are categorized as ignored.

### 4. Untrack an Already-Committed File
- Force-add and commit `.env` to simulate a scenario where a sensitive file was accidentally committed.
- Run `git rm --cached .env` to stop tracking it while preserving the file on disk.
- Commit the removal.

## Acceptance Criteria Table

| Requirement | Verification Check |
| :--- | :--- |
| .gitignore created | `.gitignore` contains rules for secrets and bytecode |
| Files ignored | `git status` excludes `.env` and `*.pyc` |
| Cached file removed | `git ls-files .env` returns empty while file remains on disk |
