# Chapter 3: What Goes Into a Commit

:::terminal-demo
id: git-what-goes-into-commit
image: labops-git-fundamentals:latest
:::

> **Before this chapter:** You should know the three Git areas — working directory, staging area, and repository — and be comfortable with `git add` and `git commit`.

> **Hands-On Practice in the Terminal:**
> Your terminal on the right comes with a pre-configured repository in `~/practice`, already initialized and connected to the remote `origin`. Enter it to follow along with the commands in this chapter:
> ```bash
> cd ~/practice
> git status
> ```

## The Problem With `git add .`

It is a Friday afternoon. You fix a critical authentication bug in `auth.py`. While you are in there, you also notice the button color in `styles.css` is wrong and fix that too. Then you add some debug logging to `api.py` that you meant to remove.

If you run `git add .` and commit everything, your history has one commit that says "fix auth bug" — but it also contains the CSS change and the debug logging. Three months later, when someone needs to understand why the auth behavior changed, they pull up that commit and find a pile of unrelated changes.

A commit contains exactly what you staged — not everything you changed.

## Staging as a Precision Tool

```
Working Directory  →  Staging Area  →  Repository
  (all your edits)    (what you chose)  (what's saved)
```

Inside `~/practice`, run `git status` to see the three modified files, then stage `auth.py`:
```bash
git add auth.py
git commit -m "Fix login redirect loop when session expires"
```

Then you stage `styles.css`:
```bash
git add styles.css
git commit -m "Fix button hover color on dashboard"
```

Then you discard `api.py`:
```bash
git restore api.py
```

Three changes made in the same afternoon. Two commits, one discarded.

## `git status` — Read It Before Every Operation

```bash
git status
```

It shows every file in three categories:

```
Changes to be committed:        ← staged, goes into the next commit
  modified:   auth.py

Changes not staged for commit:  ← modified, but not staged yet
  modified:   api.py

Untracked files:                ← new files Git does not know about
  debug.log
```

The sequence that catches people:

```bash
# You've changed three files. You stage two.
git add auth.py styles.css
git commit -m "Fix auth and button colour"

# Now you check status
git status
```

```
Changes not staged for commit:
  modified:   config.py
```

`config.py` was part of the fix. It did not make it into the commit. Now the change is split across two commits — or worse, you push and `config.py` is left in a broken state on your branch.

Run `git status` before `git add` to see what is changed. Run it again after `git add` to confirm what is staged. Run it one more time before `git commit` to make sure nothing is missing.

## `git diff` — Read the Change Before Staging It

Before staging a file, you can read exactly what changed:

```bash
git diff auth.py
```

This shows unstaged changes — lines removed (`-`) and lines added (`+`). Once you have staged the file, `git diff` no longer shows it. To see what is staged and about to be committed:

```bash
git diff --staged
```

Use both together to understand where every change is before committing.

## `git restore` — Discard or Unstage

To discard changes in the working directory (the file goes back to its last committed state):

```bash
git restore auth.py
```


> `git restore <file>` discards unstaged changes in your working directory permanently. If there is any chance you want those changes back, stash them or commit them to a separate branch before restoring.

To move a staged file back to the working directory without discarding it:

```bash
git restore --staged auth.py
```

The change is still in the file — it just left the staging area.

## Pushing Clean Commits to the Remote

Once your working tree is clean and each change is recorded in its own commit, push the branch to your remote server:

```bash
git push
```

Because your local `main` branch tracks `origin/main` (configured with `git push -u origin main`), Git automatically uploads your new commits to the remote repository. 

When your teammates or continuous integration (CI) pipelines inspect the branch, each commit appears as an independent, focused change rather than a single tangled diff.

## The Full Picture

```
git status              see what is where
git diff <file>         see unstaged changes in a file
git diff --staged       see what is staged for the next commit
git add <file>          stage a specific file
git restore <file>      discard working directory changes (permanent)
git restore --staged    move a file back from staging to working directory
git push                upload committed changes to the remote tracking branch
```

## Key Takeaways

- A commit contains what you staged, not everything you changed
- `git status` shows the state of every file — check it before and after every operation
- `git diff` shows unstaged changes; `git diff --staged` shows what is about to be committed
- `git restore <file>` discards working directory changes permanently
- `git restore --staged <file>` unstages without losing changes
- `git push` uploads your atomic commits to the remote tracking branch
