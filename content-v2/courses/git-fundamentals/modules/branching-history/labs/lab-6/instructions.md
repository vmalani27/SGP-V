# Lab 6: Undoing Pushed Mistakes

## What You're Doing and Why

Accidentally committing and pushing sensitive data (such as API keys, passwords, or environment files) is one of the most common and critical security incidents in software development. 

In this lab, you will respond to a real incident: someone committed a `.env` file containing production database credentials and pushed it to the remote repository. You will learn why simply deleting the file in a new commit fails to secure the system, how to rewind local history using `git reset`, how to prevent future leaks using `.gitignore`, and how to overwrite the remote history using `git push --force`.

## Command Reference

### `git reset --hard HEAD~1`

Moves the current branch pointer backward by one commit (`HEAD~1`), updating both the staging area and working directory to match that previous commit. Any changes introduced in the bad commit are detached from the active branch history.

### `git push --force origin main`

Overwrites the remote tracking branch `main` on `origin` with your local `main` branch. This is required when local and remote histories have diverged because you rewound local commits.

## Scenario

You are inspecting `/home/student/api-service`. Recent commits show that database credentials were leaked and pushed to the remote Git server. Your mission is to diagnose the security risk, rewind the branch to the clean commit before the secret, configure `.gitignore` to prevent future leaks, and force-push the cleaned history to the remote repository.

## Objective

1. Diagnose why deleting a sensitive file in a subsequent commit does not remove it from Git history.
2. Rewind the local branch to the clean initial commit using `git reset`.
3. Add `.env` to `.gitignore` and commit it.
4. Overwrite remote history using `git push --force`.
