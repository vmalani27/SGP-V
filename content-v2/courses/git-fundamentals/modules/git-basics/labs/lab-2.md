# Lab 2: Initializing a Repository and Making Your First Commit

## What You're Doing and Why

A Git repository is a directory that Git is tracking. When you initialize a repository, Git creates a hidden `.git` folder that stores the entire history of your project. This lab teaches you the fundamental cycle that every developer repeats hundreds of times per day: modify a file, stage it, and commit it.

## Background

Git separates the act of choosing what to record from the act of recording it. The staging area, sometimes called the index, sits between your working files and your commit history. When you run `git add`, you are saying "I want to include this change in my next commit." When you run `git commit`, you are saying "Record everything in the staging area as a permanent snapshot." This two-step process exists because you often change several files at once but want to create commits that each represent one logical change. You use the staging area to compose exactly the right snapshot before committing.

## Command Reference

### `git init`

Creates a new Git repository in the current directory by creating the `.git` folder.

### `git status`

Shows the current state of the working directory and staging area. It tells you which files are untracked, which are staged, and which are modified but not staged.

### `git add <file>`

Stages a specific file. `git add .` stages all changed files in the current directory.

### `git commit -m "message"`

Creates a commit with all staged changes. The message should describe what changed and why.

### `git log`

Shows the commit history. Each commit has a unique SHA hash, the author, the date, and the message.

## Scenario

You are starting a new project. Create a project directory, write a simple README file that describes the project, and record it as the first commit in the repository's history.

## Objective

Initialize a repository, create at least one file, stage it, and commit it with a meaningful message. Verify the commit appears in the log.

## Reflection

Run `git log` and look at the commit hash. It is a long string of hexadecimal characters. This hash is computed from the content of the commit itself, which means identical commits always have identical hashes and any change to the content produces a completely different hash. This is how Git guarantees the integrity of your history.
