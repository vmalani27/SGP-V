# Lab 3: Staging Selectively — Clean Commits from a Messy Working Tree

## Scenario

You sit down Monday morning to find the repository in `/home/student/webapp` in an uncomfortable state: three files were modified during a late-night session — an authentication fix, a CSS colour change, and some debug logging that was never meant to be committed. All three changes are sitting in the working tree, unstaged.

Your job is to produce a clean, atomic commit history — each logical change gets its own commit. One messy afternoon's work, two separate commits in the log, discarded debug noise, and a final push to the remote server.

## What You'll Do

- Inspect the working tree with `git status` and `git diff` before touching anything
- Stage and commit only `auth.py` — leaving the other files untouched
- Stage and commit only `styles.css` — separately
- Discard the debug changes in `api.py` using `git restore`
- Verify that your history contains clean, atomic commits
- Push your clean commits to the remote server (`origin/main`)

## Operational Specifications

### 1. Understand Before You Stage
- Run `git status` to confirm which files are modified.
- Run `git diff` to read the actual line-level changes.
- Know what each file changed before staging anything.

### 2. Atomic Commits
- `auth.py` and `styles.css` each get their own commit with a descriptive message.
- `api.py` changes are discarded — they are debug noise, not a real fix.

### 3. Verify Working Tree and History
- Confirm `git diff api.py` produces no output.
- Inspect `git log --oneline` to review the commits created.

### 4. Push to Remote
- Run `git push` to synchronize your commits with `http://git-server:3000/student/webapp.git`.

## Acceptance Criteria Table

| Requirement | Verification Check |
| :--- | :--- |
| auth.py committed alone | `git log --name-only` shows auth.py in its own commit |
| styles.css committed alone | `git log --name-only` shows styles.css in a separate commit |
| api.py has no uncommitted changes | `git diff api.py` produces no output |
| Three total commits in the log | `git log --oneline` shows the initial commit plus two atomic ones |
| Remote is synchronized | `git ls-remote origin refs/heads/main` matches local `HEAD` |
