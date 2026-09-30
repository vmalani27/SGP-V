# Chapter 4: Building Clean Commits

:::terminal-demo
id: git-clean-commits
image: labops-git-fundamentals:latest
:::

> **Before this chapter:** You should know `git add`, `git commit`, `git status`, and `git diff` from Chapter 3.

> **Hands-On Practice in the Terminal:**
> Your terminal on the right comes with a pre-configured repository in `~/practice`. Enter it to inspect changes and try interactive staging:
> ```bash
> cd ~/practice
> git status
> ```

## The Problem With One File, Two Changes

You are working on `auth.py`. You fix a real bug — the password check was rejecting valid inputs with special characters. While you are in the file, you also rename a variable for clarity. These are two separate changes made for two distinct reasons.

If you run `git add auth.py` and commit, both changes are packaged together. Anyone reviewing the commit history will see a single commit containing two unrelated changes, making it difficult to understand the intent or revert one without undoing the other.

`git add -p` lets you stage one section (or "hunk") at a time within a single file.

## Interactive Staging with `git add -p`

```bash
git add -p auth.py
```

Git splits the file into hunks — contiguous changed sections — and prompts you for an action on each:

```
@@ -12,7 +12,7 @@ def authenticate(user, password):
-    if password == "":
+    if not password:
         return False

Stage this hunk [y,n,q,a,d,s,e,?]?
```

Your primary options:
- `y` — stage this hunk for the next commit
- `n` — skip this hunk (leave it unstaged in your working directory)
- `s` — split the hunk into smaller, more granular sub-hunks
- `q` — quit interactive staging; leave remaining hunks unstaged
- `?` — print help explaining all available commands

Interactive staging lets you separate unrelated changes even when they live in the exact same source file.

> `git add -p` doubles as a line-by-line self-review — you inspect every modification before committing it to history.

## Verifying What You Are About to Commit

Before staging:
```bash
git diff
```

`git diff` displays unstaged modifications in your working directory compared to your last commit. If a change remains in your working directory, it will not be included in your next commit.

After staging a specific hunk with `git add -p`:
```bash
git diff --staged
```

The `--staged` flag tells Git to inspect only the changes currently sitting in your staging area. This shows you exactly what will be recorded when you run `git commit`.

Then commit the staged hunk:
```bash
git commit -m "Fix password check rejecting inputs with special characters"
```

Stage and commit the second chunk separately:
```bash
git add -p auth.py
# answer y to the variable rename hunk
git commit -m "Rename pwd_input to raw_password for clarity"
```

Two commits. Two reasons. Each one tells a single, coherent story.

## What Makes a Good Commit

A commit is an atomic unit of reasoning. A teammate reviewing a pull request or your future self debugging a production regression benefits from commits that answer one question: **what changed, and why**.

Signs a commit should be split:
- The message requires "and" to describe what changed (`"Fix auth and rename variable"`)
- The diff contains changes to files that serve different purposes
- A test failure on this commit would leave you unsure which change caused it

Signs a commit is the right size:
- The message fits in one clause
- Reverting it would undo exactly one logical change
- A reviewer can approve or reject it based on its single purpose

## Pushing Atomic Commits to the Remote Server

Once your working tree is clean and each hunk is recorded in its own commit, upload your branch to the remote repository:

```bash
git push
```

Because your branch tracks `origin/main` (configured via `git push -u origin main`), Git sends both atomic commits to the central server. On the remote platform, code reviews, audit trails, and automated tests evaluate each commit independently.

## `git add -p` in Practice

Running `git add .` in a shared repository is a habit that makes history harder to read. Most engineers who work on shared codebases use `git add -p` or `git add <specific-file>` for every commit. The staging step is where commit hygiene happens — not in the editor.

```bash
git diff             # inspect unstaged changes
git add -p           # stage chunk by chunk
git diff --staged    # confirm what is about to be committed
git commit -m "..."  # commit exactly that
git push             # publish to remote
```

## Key Takeaways

- `git add -p` stages one hunk at a time, letting you split one file into multiple atomic commits
- `s` splits a hunk into smaller pieces; `n` skips a hunk entirely
- `git diff --staged` shows what is about to be committed — read it before every `git commit`
- A good commit answers one question: what changed, and why
- If a commit message needs "and" to describe what it contains, it probably should be two commits
- `git push` uploads your atomic commits to the remote tracking branch
