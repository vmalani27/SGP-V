# Lab 12: A Complete Git Workflow

## What You're Doing and Why

Real development does not use Git commands in isolation. It follows an end-to-end workflow: start from an up-to-date main branch, create a feature branch for your task, make focused commits as you work, keep your branch synchronized with incoming changes from your teammates, merge when work is approved, and publish your work upstream.

In this capstone lab, you will execute a complete daily branch-based development cycle on `~/workspace/workflow-project`.

## Scenario

You have joined the development team for `workflow-project`. You are assigned to build an analytics tracking integration on an isolated feature branch (`feature/analytics`). While you are authoring your feature, a colleague merges and publishes release notes (`CHANGELOG.md`) directly to `origin main`.

Your objective is to:
1. Branch off `main` to `feature/analytics`.
2. Implement and commit the feature across two focused commits.
3. Synchronize with the upstream changes published by your teammate.
4. Merge `feature/analytics` into `main`, publish to `origin`, and clean up the feature branch.

## Command Reference

### `git switch -c <branch>`
Creates and switches to a new branch in one command.

### `git pull origin <branch>`
Fetches from the remote repository and integrates changes into the current branch.

### `git merge <branch>`
Merges the named branch into the current checked-out branch.

### `git push origin <branch>`
Publishes commits to the remote tracking branch.

### `git branch -d <branch>`
Safely deletes a local branch that has already been merged.

## Tasks

- [ ] **create-feature-branch** — Create and switch to `feature/analytics` in `~/workspace/workflow-project`.
- [ ] **author-feature-commits** — Author two distinct commits (`src/analytics.js` and `app.js`).
- [ ] **sync-upstream-main** — Pull upstream changes (`CHANGELOG.md`) into `main` and sync your feature branch.
- [ ] **merge-and-publish-workflow** — Merge to `main`, push to `origin`, and delete `feature/analytics`.
