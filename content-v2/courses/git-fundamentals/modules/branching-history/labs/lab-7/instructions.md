# Lab 5: Branches

## What You're Doing and Why

A branch is an independent line of development. Without branches, every developer working on the same project would constantly interfere with each other. Branches let you develop a feature, fix a bug, or run an experiment in isolation, without affecting the main codebase until you are ready to merge.

## Background

A branch in Git is simply a pointer to a commit. When you create a branch and switch to it, Git moves HEAD to point at that branch. Every new commit you make advances that branch pointer forward while leaving other branches exactly where they were. This makes branches in Git almost free to create, because they are nothing more than a 41-byte file containing a commit hash.

## Command Reference

### `git branch <name>`

Creates a new branch pointing at the current commit.

### `git switch <name>`

Switches to an existing branch.

### `git switch -c <name>`

Creates and switches to a new branch in one step.

### `git branch`

Lists all local branches. The asterisk marks the currently active branch.

### `git log --oneline --graph --all`

Shows a compact visual graph of all branches and their commit history.

## Scenario

You are working on a stable project and receive a request to add a new feature. Create a feature branch, make two commits on it, and then return to main without losing any work.

## Objective

Create a branch, make at least two commits on it, switch back to main, and use `git log --all --graph` to see both branches in the history.

## Reflection

Notice that when you switch back to main, the files in your working directory change to reflect the state of main. Git is swapping file contents based on the branch you are on. This is why Git requires a clean working tree before switching branches.
