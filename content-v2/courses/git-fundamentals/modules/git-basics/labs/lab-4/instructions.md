# Lab 4: Building Clean Commits with git add -p

## Scenario

You are working on `auth.py`. During a coding session, you fixed an authentication bug where empty/invalid passwords were not handled properly, and you also renamed a function parameter (`user_id` to `uid`) for consistency.

Both edits are currently sitting in `auth.py` in your working directory. Rather than bundling these unrelated modifications into a single cluttered commit, you will use `git add -p` to stage and commit each hunk independently.

## What You'll Do

- Inspect unstaged modifications with `git diff auth.py`
- Selectively stage only the bug fix using `git add -p auth.py`
- Verify staged changes with `git diff --staged`
- Commit the bug fix with an informative, focused message
- Stage and commit the remaining parameter rename as a second atomic commit

## Operational Specifications

### 1. Diff Inspection
- Run `git diff auth.py` to identify the distinct changes made to the file.

### 2. Interactive Patch Staging
- Use `git add -p auth.py` to interactively review hunks.
- Answer `y` for the bug fix hunk and `n` for the parameter rename hunk (or `s` to split if necessary).
- Check `git diff --staged` to confirm that only the bug fix is staged.

### 3. Atomic Commits
- Commit the first change with a clear summary of the bug fix.
- Stage the remaining change and commit it with a separate message explaining the parameter rename.

## Acceptance Criteria Table

| Requirement | Verification Check |
| :--- | :--- |
| Bug fix committed first | `git log --oneline` shows commit for the password fix |
| Parameter rename committed second | `git log --oneline` shows commit for the parameter rename |
| Clean working directory | `git status` shows no unstaged or uncommitted changes |
