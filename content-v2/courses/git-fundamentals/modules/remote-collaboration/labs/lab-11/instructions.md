# Lab 11: Viewing and Searching History

## What You're Doing and Why

A commit log is only useful if you can find things in it. When a bug or security incident occurs in production, the first question is: what changed recently, and who introduced it? Git provides tools to search through history by message or content diffs, filter by author or date, and trace every line of code to its originating commit.

## Scenario

A security review discovered that a dangerous configuration bypass (`ENABLE_DEV_BYPASS = True`) was committed to the repository in `~/workspace/incident-investigation`. Your objective is to use Git's investigation tools to trace the history:

1. Count the total commits in the repository using `git log --oneline`.
2. Pinpoint the exact commit that introduced the bypass using Git's pickaxe search (`git log -S`).
3. Attribute the modification to its author using `git blame`.
4. Inspect the exact diff using `git show`.

## Command Reference

### `git log --oneline`
Compact one-line-per-commit view of history.

### `git log -S "<string>" --oneline`
Pickaxe search: searches for commits whose diffs added or removed `<string>`.

### `git blame <file>`
Displays line-by-line attribution of a file, showing the author, commit hash, and timestamp for each line.

### `git show <hash>`
Shows the full commit metadata and diff of `<hash>`.

## Tasks

- [ ] **audit-recent-commits** — Inspect `git log --oneline` and write the total commit count to `~/commit-count.txt`.
- [ ] **search-code-change** — Locate the commit that added `ENABLE_DEV_BYPASS = True` with `git log -S` and save its short hash to `~/vulnerable-commit.txt`.
- [ ] **blame-line-author** — Attribute the change using `git blame src/auth.py`.
- [ ] **inspect-commit-diff** — Inspect the commit with `git show` and record the modified file path to `~/affected-file.txt`.
