# Lab 1: Setting Up Git

## What You're Doing

Every commit you make in Git records who wrote it: your name and your email address. If these are missing or wrong, your team won't know who made which changes.

In this lab, you'll set your default username, email, and starting branch name. Then you'll create a quick test repo to make sure those defaults work.

## How Git Saves Settings

Git looks for configuration in three places:
- **System (`/etc/gitconfig`)**: Machine-wide defaults for every user account.
- **Global (`~/.gitconfig`)**: Defaults for your user account on this machine.
- **Local (`.git/config`)**: Overrides that apply only to one specific repo.

When you pass `--global`, Git writes directly to `~/.gitconfig`.

## Your Goal

1. Set your global Git username to `Alex Chen`.
2. Set your global Git email to `alex.chen@engineering.local`.
3. Set your default starting branch name to `main`.
4. Create a test repo at `~/workspace/verification-project` to verify your branch setting works.

## Quick Reference

### `git config --global <setting> "<value>"`
Writes a setting to your global config file (`~/.gitconfig`).

### `git config --list`
Prints all active settings on your terminal.

### `git init`
Creates a fresh Git repo inside the current folder.

