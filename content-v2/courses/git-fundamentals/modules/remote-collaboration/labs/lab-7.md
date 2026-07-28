# Lab 7: Working with Remote Repositories

## What You're Doing and Why

A remote repository is a copy of the project hosted somewhere accessible to the rest of your team. Pushing your commits to a remote makes your work available to others. Pulling from a remote brings their work into your local repository. Understanding this push-pull cycle is essential for collaborating with anyone.

## Background

Git calls the default remote `origin` by convention, though the name is arbitrary. When you clone a repository, Git automatically sets up `origin` pointing at the URL you cloned from. When you push, you are sending your local commits to the remote. When you pull, you are fetching commits from the remote and merging them into your current branch. Fetch alone downloads the commits without merging, which lets you inspect what changed before integrating it.

## Command Reference

### `git remote add origin <url>`

Adds a remote named `origin` pointing at the specified URL.

### `git push -u origin main`

Pushes the main branch to origin and sets it as the upstream so future pushes can use `git push` alone.

### `git pull`

Fetches from the upstream remote and merges into the current branch.

### `git fetch`

Downloads remote changes without merging them.

### `git clone <url>`

Creates a local copy of a remote repository, including all branches and history.

## Scenario

A remote repository has been prepared for you with some existing commits. Clone it, make a change locally, and push your change back to the remote.

## Objective

Clone the provided repository, create a commit, and push it. Verify that the remote now shows your commit.

## Reflection

When you run `git fetch` and then `git log origin/main`, you are looking at what the remote branch looks like without yet changing your local branch. This is a safe way to see what your colleagues have pushed before you decide to integrate their work.
