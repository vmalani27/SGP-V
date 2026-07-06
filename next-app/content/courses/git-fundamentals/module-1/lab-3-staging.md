# Lab 3: Staging Selectively and Understanding the Working Tree

## What You're Doing and Why

Real commits rarely involve every file you touched. You might fix a bug in one file and update documentation in another, but these are two separate changes that deserve two separate commits. This lab teaches you to stage precisely, so your commit history tells a clear story rather than dumping everything into one vague snapshot.

## Background

At any moment your files exist in one of three places: the working tree, the staging area, or committed history. The working tree is what you see in your filesystem right now. The staging area is what Git will record in the next commit. Committed history is permanent and immutable. When you run `git diff`, it shows the difference between your working tree and the staging area. When you run `git diff --staged`, it shows the difference between the staging area and the last commit. Understanding this three-way distinction is essential before you can use Git confidently.

## Command Reference

### `git diff`

Shows changes in the working tree that have not yet been staged.

### `git diff --staged`

Shows changes that are staged and will be included in the next commit.

### `git restore --staged <file>`

Removes a file from the staging area without discarding the changes in your working tree.

## Scenario

You have fixed a bug in `app.py` and also updated `README.md` with new instructions. These are unrelated changes. Create two separate commits: one for the bug fix and one for the documentation update.

## Objective

Modify two separate files. Stage and commit them independently so that your log shows two distinct commits, each representing one logical change.

## Reflection

Think about what would happen if every developer committed every file they touched in one big commit. How would a colleague reading the history understand what changed and why? Good commits are not just a backup mechanism; they are communication.
