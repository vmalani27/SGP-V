# Lab 6: Merging and Resolving Conflicts

## What You're Doing and Why

Merging combines the work from one branch into another. When two branches change different parts of the codebase, Git can merge them automatically. When they change the same lines, Git cannot decide which version is correct and asks you to resolve the conflict manually. Conflict resolution is a daily skill for any developer working on a team.

## Background

When a conflict occurs, Git pauses the merge and marks the conflicting sections in the file with conflict markers. The section between `<<<<<<<` and `=======` is the content from your current branch. The section between `=======` and `>>>>>>>` is the content from the branch being merged. Your job is to edit the file to produce the correct result, remove the conflict markers, stage the resolved file, and complete the merge with a commit.

## Command Reference

### `git merge <branch>`

Merges the specified branch into the currently active branch.

### `git status`

During a merge conflict, shows which files have conflicts that need to be resolved.

### `git merge --abort`

Cancels a merge in progress and returns the repository to the state before the merge started.

## Scenario

Two branches have each modified the same line in a file. Merge one branch into the other, resolve the conflict by combining both changes, and complete the merge.

## Objective

Produce a merge conflict deliberately, resolve it correctly, and complete the merge. The final file should contain the intended result from both branches.

## Reflection

A conflict is not an error. It is Git telling you that it cannot make a decision that requires human judgment. Professional developers encounter conflicts regularly. The important skill is reading the conflict markers carefully and producing a result that is logically correct, not just syntactically valid.
