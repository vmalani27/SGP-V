# Lab 5: Keeping Unwanted Files Out with .gitignore

## Scenario

Your application directory in `/home/student/webapp` contains local credential files (`.env`, `.env.local`) and compiled Python bytecode (`app.pyc`, `__pycache__/`). Left unignored, a broad staging operation would include these sensitive and generated files in the commit history.

Your goal is to inspect the untracked workspace files, configure `.gitignore` to exclude environment and bytecode artifacts, commit `.gitignore`, and push the updated branch to `origin/main`.

## Objectives

- Identify untracked sensitive and generated files in the working directory
- Configure `.gitignore` patterns to exclude environment files and Python bytecode
- Commit `.gitignore` and synchronize `main` with `origin/main`

## Acceptance Criteria

| Requirement | Expected Outcome |
| :--- | :--- |
| `.gitignore` created | Excludes `.env`, `.env.*`, `*.pyc`, and `__pycache__/` |
| Unwanted files ignored | Environment and bytecode files remain on disk but do not appear as untracked |
| Rules committed & pushed | `.gitignore` is committed on `main` and pushed to `origin/main` |
