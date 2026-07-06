# Lab 9: Viewing and Searching History

## What You're Doing and Why

A commit log is only useful if you can find things in it. When a bug is reported in production, the first question is: what changed recently? When a line of code does not make sense, you want to know who wrote it and why. Git provides tools to search through history, filter by author or date, and trace every change to a specific line of code.

## Command Reference

### `git log --oneline`

Compact one-line-per-commit view of history.

### `git log --author="name"`

Filters commits by author name.

### `git log --since="2 weeks ago"`

Shows commits from the last two weeks.

### `git log -S "search term"`

Searches for commits that added or removed the specified string.

### `git show <hash>`

Shows the full diff of a specific commit.

### `git blame <file>`

Shows the last commit that modified each line of a file, with the author and date.

## Scenario

A file in the repository contains a line that appears incorrect. Use `git blame` to identify which commit introduced it, then use `git show` to read the full context of that commit.

## Objective

Identify a specific commit using `git blame` and examine its full diff using `git show`.

## Reflection

`git blame` is not for assigning fault; it is for understanding context. The goal when reading blame output is to find the commit message that explains the reasoning behind a change. A well-written commit message turns a mysterious line of code into something entirely understandable.
