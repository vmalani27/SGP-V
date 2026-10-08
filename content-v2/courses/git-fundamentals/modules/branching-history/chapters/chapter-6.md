# Chapter 6: Undoing Pushed Mistakes

## The Situation: How It Actually Happens

A developer finishes writing updates to the application code. Before merging, a programmer or QA tester pulls down the changes to test them locally.

To test the application against a local database, they create a `.env` file containing database credentials. What they don't realize is that this repository doesn't have a `.gitignore` set up yet.

Once testing succeeds, the programmer prepares to commit their work. Instead of running `git status` to see what is about to be staged, they run a quick blanket command:

```bash
git add .
git commit -m "Update application logic and test configs"
```

Just like that, the `.env` file containing sensitive credentials was staged alongside the code and sealed into a commit.

Throughout this chapter, you will use the pre-configured repository in the `~/practice` folder in your terminal to see firsthand why deleting files doesn't fix a leaked secret, and how to safely rewind history when this happens.

## Recreating the Scenario in Your Terminal

Let's set up this exact situation in your practice terminal so you can observe the problem and learn how to fix it.

Switch into the practice repository:

```bash
cd ~/practice
```

First, discard any leftover changes from previous exercises so you start with a clean slate:

```bash
git restore .
git status
```

Now, recreate what the programmer did—create the local environment file for testing, then run a blanket `git add .` and commit:

```bash
echo "DB_PASSWORD=SuperSecretPass123" > .env
git add .
git commit -m "Update application logic and test configs"
```

The secret is now committed to your local history. Inspect the latest commit:

```bash
git log --oneline -n 2
```

## The Common Mistake: Why Deleting the File Fails

When developers realize they committed a secret, their immediate instinct is usually:

```bash
rm .env
git add .env
git commit -m "Remove secret"
```

Try running those three commands in your terminal right now.

Now run `git status`. The working directory looks completely clean! `.env` is gone. Problem solved, right?

**No.** Git is not a simple file backup tool—it is a history tracker. Every commit is an immutable snapshot.

See for yourself by inspecting Git's commit history:

```bash
git log -p -n 2
```

Or inspect the file from the previous commit directly:

```bash
git show HEAD~1:.env
```

`DB_PASSWORD=SuperSecretPass123` is right there in plain text!

If this repository were pushed to GitHub or GitLab, automated scraping bots scan commit feeds within seconds. As long as that commit exists anywhere in history, the secret is compromised.

## Step 1: The Golden Rule — Rotate the Credential

Before touching Git, you must assume the secret is compromised the moment it leaves your machine.

1. Generate a new database password or API token.
2. Invalidate the old token.

Rewriting Git history without rotating the key is meaningless—the key was already exposed to the network.

## Step 2: Rewinding Local History with git reset

To remove the bad commits from your branch, you need to rewind your branch pointer to the clean state before the secret was ever committed.

Because we made two mistake commits (one adding the secret, one deleting it), we want to rewind back 2 commits.

Git provides `git reset` to move your branch pointer backward:

```bash
git reset --hard HEAD~2
```

* `HEAD~2` tells Git to move back 2 commits behind `HEAD`.
* `--hard` tells Git to reset both the staging area and the working directory to match that earlier clean commit.

Check your log again:

```bash
git log --oneline -n 3
```

Notice that both bad commits are completely gone from your branch's timeline!

Now, create the `.gitignore` properly:

```bash
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Add .gitignore to exclude environment secrets"
```

## Step 3: Overwriting Remote History with git push --force

If the bad commit had already been pushed to the remote server, your local branch is now behind the remote branch. A normal push will be rejected:

```bash
git push
```

Git rejects this because the remote still contains the bad commit that your local history removed.

To overwrite the remote branch and eliminate the bad commit from shared history, use `--force`:

```bash
git push --force origin main
```

With `--force`, the remote server updates its branch pointer to match your local commit, removing the bad commit from the branch's timeline.

> **Team Warning: Force-Pushing on Shared Branches**  
> Force-pushing rewrites remote history. If teammates have already pulled the bad commit, their local branches will diverge, causing errors next time they pull.  
> In team settings, repositories often have branch protection rules that block direct force-pushing to `main`. When working on personal feature branches, `--force-with-lease` is the safer alternative because it prevents overwriting remote work if someone else added commits while you were working.

## Summary Checklist for Incident Remediation

1. **Rotate the credential immediately** (always the first step).
2. **Rewind local history:** `git reset --hard HEAD~1` (or to the clean commit SHA).
3. **Protect against re-committing:** Add the file to `.gitignore` and commit.
4. **Update remote history:** `git push --force` to overwrite the remote branch.
