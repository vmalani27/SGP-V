# Chapter 2: Your First Repository

## In this chapter, you will

- Create a Git repository from scratch
- Understand the three areas of a Git project
- Make your first commits with meaningful messages

## What Happens When You Initialize a Repository

When you run `git init` in a folder, Git creates a hidden `.git` directory. This directory is the engine room. It stores every commit, every branch, all configuration, and all history for that project.

You do not need to understand everything inside `.git` right now. The important thing to know is: if you delete `.git`, Git loses all history. Everything outside `.git` is your working files.

Create a folder and initialize it:

```
mkdir my-project
cd my-project
git init
```

You will see a message like `Initialized empty Git repository in .../my-project/.git/`. That is it. Your folder is now a Git repository.

## The Three Areas of a Git Project

This is the most important mental model in Git. Your files exist in one of three places:

```
Working Directory  -->  Staging Area  -->  Repository
   (your files)        (git add)        (git commit)
```

1. **Working Directory** — the files you see and edit in your code editor. These are the actual files on your disk.

2. **Staging Area** — a middle zone where you prepare your next commit. You choose which changes to include. This lets you create focused commits even when you have changed many files.

3. **Repository** — where committed snapshots live permanently. Once you commit, Git records the snapshot forever (until you deliberately rewrite history).

The flow is: you edit files in your working directory, you stage the ones you want to save, and you commit them into the repository.

## Making Your First Commit

Create a file in your project:

```
echo "Hello, Git" > README.md
```

Check the status:

```
git status
```

Git will tell you there is an untracked file called `README.md`. "Untracked" means Git sees it but is not watching it yet.

Stage it:

```
git add README.md
```

Now `git status` will show the file under "Changes to be committed". It is in the staging area.

Commit it:

```
git commit -m "Add README with project description"
```

The `-m` flag lets you write the commit message inline. Without it, Git opens a text editor for you to write the message.

## Writing Commit Messages That Help

A commit message should answer one question: **what did this change and why?**

Bad messages:
- `update`
- `fix stuff`
- `WIP`

Good messages:
- `Add README with project description`
- `Fix login redirect loop when session expires`
- `Remove deprecated search endpoint`

The convention is to write a short summary in the imperative mood (as if you are giving a command), followed by a blank line and a longer explanation if needed.

> **Warning:** Do not write commit messages like `fixed bug` or `changes`. Six months from now, you will have no idea what those mean. Write messages that explain the *why*, not just the *what*.

## Seeing Your History

After your first commit, run:

```
git log
```

You will see your commit with its SHA hash (a 40-character unique ID), your name, the date, and your message. This is your project's timeline.

To see a compact view:

```
git log --oneline
```

> **Try This:** Make a second change to `README.md`, stage it, and commit it with a different message. Then run `git log --oneline` to see both commits. Notice how the most recent commit appears at the top.

## Key Takeaways

- `git init` creates a `.git` folder that stores all Git history
- Files live in three areas: working directory, staging area, and repository
- `git add` moves changes to the staging area; `git commit` saves them permanently
- Write commit messages that explain what changed and why
