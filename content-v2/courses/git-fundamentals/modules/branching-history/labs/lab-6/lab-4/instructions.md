# Lab 4: Undoing Mistakes

## What You're Doing and Why

Every developer makes mistakes. The confidence to move quickly comes from knowing you can always undo. Git provides several ways to reverse changes depending on where the change lives: in your working tree, in the staging area, or already committed. This lab teaches you which tool to reach for in each situation.

## Background

Git distinguishes between undoing something that has not yet been committed and undoing something that already has been. For uncommitted changes, you are simply discarding work. For committed changes, Git creates a new commit that reverses the previous one rather than rewriting history. This is important because rewriting shared history causes problems for other developers who have already built on top of it.

## Command Reference

### `git restore <file>`

Discards changes in the working tree and restores the file to its last committed state. This is destructive and cannot be undone.

### `git restore --staged <file>`

Unstages a file without discarding the working tree changes.

### `git revert <commit-hash>`

Creates a new commit that undoes the changes introduced by the specified commit. Safe to use on shared branches.

### `git reset --soft HEAD~1`

Moves the branch pointer back one commit but keeps the changes staged. Useful for rewriting a commit message or splitting a commit.

## Scenario

You committed a change that introduced a bug. Use `git revert` to create a new commit that undoes it, without erasing the original commit from history.

## Objective

Create a commit, then revert it. Verify that your log shows both the original commit and the revert commit, and that the file contents are back to the state before the original commit.

## Reflection

Why does Git create a new commit instead of simply deleting the old one when you revert? Consider what would happen if two developers had already pulled the commit you wanted to erase, and you rewrote history on the server. Their local history would no longer match the server.
