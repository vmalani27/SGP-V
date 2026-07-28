# Lab 8: Stashing Work in Progress

## What You're Doing and Why

You are halfway through a change when your manager asks you to fix an urgent bug on a different branch. Your current work is not ready to commit, but switching branches would abandon it. Git stash saves your uncommitted changes to a temporary area so you can switch branches, do the urgent work, and then come back to exactly where you left off.

## Background

The stash is a stack. Each time you run `git stash`, Git pushes your current changes onto the stack and gives you a clean working tree. You can stash multiple times. When you are ready to resume, `git stash pop` removes the most recent stash and applies it to your working tree. If you have multiple stashes, `git stash list` shows them and `git stash apply stash@{n}` applies a specific one without removing it from the stack.

## Command Reference

### `git stash`

Saves all uncommitted changes and gives you a clean working tree.

### `git stash list`

Shows all saved stashes.

### `git stash pop`

Applies the most recent stash and removes it from the stash stack.

### `git stash drop`

Deletes the most recent stash without applying it.

## Scenario

You have modified two files for a feature you are working on. Before finishing, you need to switch to the main branch and make an unrelated fix. Stash your in-progress work, make the fix, and then return to your feature and restore your changes.

## Objective

Stash uncommitted work, switch branches, make a commit, switch back, and pop the stash. Verify that your original changes are restored.

## Reflection

Notice that the stash is local to your machine and is not pushed to the remote. It is a personal scratchpad for temporary saves. If you delete your repository or the machine, the stash is gone.
