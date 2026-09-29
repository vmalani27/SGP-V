# Chapter 4: Building Clean Commits

:::terminal-demo
id: git-clean-commits
image: labops-git-fundamentals:latest
:::

> **Before this chapter:** You should know `git add`, `git commit`, `git status`, and `git diff` from Chapter 3.

## The Problem With One File, Two Changes

You are working on `auth.py`. You fix a real bug — the password check was rejecting valid inputs with special characters. While you are in the file, you also rename a variable for clarity. These are two separate changes with two separate reasons.

If you `git add auth.py` and commit, both changes go in together. so any one looking at the commit history will see 1 commit to the file, and wonder why 2 different unrelated changes are present in 1 commit/

`git add -p` lets you stage one section at a time within a file.

## Interactive Staging with `git add -p`

```bash
git add -p auth.py
```

Git splits the file into hunks — contiguous changed sections — and asks what to do with each:

```
@@ -12,7 +12,7 @@ def authenticate(user, password):
-    if password == "":
+    if not password:
         return False

Stage this hunk [y,n,q,a,d,s,e,?]?
```

Your options:
- `y` — stage this hunk
- `n` — skip it (leave in working directory)
- `s` — split the hunk into smaller pieces
- `q` — stop staging, leave remaining hunks unstaged
- `?` — show all options

Interactive staging lets you separate unrelated changes even when they are in the same file.

> `git add -p` also doubles as a self-review — you read every change before it becomes a commit.

## Verifying What You Are About to Commit
```bash
git diff
```

this tells us the changes made locally in the workding directory while comparing it to the last commit of the file. do note that if a file is still in working directory, which you wanted to commit, it wont be staged

After staging with `git add -p`, check what is staged:

```bash
git diff --staged
```

The staged flag tells us exactly what will go into the next commit. 



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

Two commits. Two reasons. Each one tells a single story.

## What Makes a Good Commit

A commit is a unit of reasoning. A reviewer reading a PR or your future self debugging an incident — they all benefit from commits that answer one question: what changed, and why.

Signs a commit should be split:
- The message requires "and" to describe what changed (`"Fix auth and rename variable"`)
- The diff contains changes to files that serve different purposes
- A test failure on this commit would leave you unsure which change caused it

Signs a commit is the right size:
- The message fits in one clause
- Reverting it would undo exactly one logical change
- A reviewer can approve or reject it based on its single purpose

## `git add -p` in Practice

Running `git add .` in a shared repository is a habit that makes history harder to read. Most engineers who work on shared codebases use `git add -p` or `git add <specific-file>` for every commit. The staging step is where commit hygiene happens — not in the editor.

```bash
git diff             # what has changed but is not staged
git add -p           # stage chunk by chunk
git diff --staged    # confirm what is about to be committed
git commit -m "..."  # commit exactly that
```

## Key Takeaways

- `git add -p` stages one hunk at a time, letting you split one file into multiple commits
- `s` splits a hunk into smaller pieces; `n` skips a hunk entirely
- `git diff --staged` shows what is about to be committed — read it before `git commit`
- A good commit answers one question: what changed, and why
- If a commit message needs "and" to describe what it contains, it probably should be two commits
