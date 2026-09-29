# Chapter 2: Your First Repository

> **Before this chapter:** You should be comfortable in a terminal — `cd`, `mkdir`, creating files with a text editor.

## The Real Reason You Need This

Here is a situation that happens to every developer. You are working on a script. It works. You decide to improve it. An hour later it is broken and you cannot remember what you changed. You have no way to go back.

Or: your teammate emails you "hey I updated the deployment config" and overwrites the change you made this morning. Neither of you knew the other was editing it.

Git solves both problems. Git is known to be a version control system.
## What Happens When You Initialize a Repository

When you run `git init` in a folder, Git creates a hidden `.git` directory. This is the engine room — it stores every commit, every branch, all configuration, and all history.

```bash
mkdir my-project
cd my-project
git init
```

You will see: `Initialized empty Git repository in .../my-project/.git/`

One rule to remember: **if you delete `.git`, you lose all history.** Everything outside `.git` is just your working files — Git does not manage those until you tell it to.

## The Three Areas of a Git Project

This is the most important mental model in Git. Every file you touch exists in one of three places:

```
Working Directory  -->  Staging Area  -->  Repository
   (your edits)        (git add)        (git commit)
```

1. **Working Directory** — The files you see and edit in your folder. Changes here are not tracked by Git until you tell it to.
2. **Staging Area** — The preparation area for your next commit. Staging a file tells Git: *"Include this file's current state in the next snapshot."* Running `git add` puts files here.
3. **Repository** — The permanent snapshots stored inside `.git`. Running `git commit` takes whatever is in the staging area and permanently records it.

Why have a staging area instead of committing directly? Because you don't always want to commit every file you touched. Staging acts like a packing list: you pick the exact changes you want to package into this snapshot, leaving the rest for later.

## Making Your First Commit

Create a file:

```bash
echo "# My Project" > README.md
```

Check what Git sees:

```bash
git status
```

Git reports that `README.md` is "untracked" — Git sees the file in your directory, but it is not queued for the next snapshot.

To tell Git to include it, **stage** it using `git add`:

```bash
git add README.md
```

Staging places the file into the staging area. Check `git status` again to see what changed:

```bash
git status
```

Now `git status` shows `README.md` under **"Changes to be committed."** That is what staging means: the file is selected, queued up, and waiting to be committed.

Commit it:

```bash
git commit -m "Add README with project description"
```

You just created your first permanent snapshot. Even if you delete the file right now, Git can recover it.

## Writing Commit Messages That Help You Later

A commit message answers one question: **what changed, and why?**

Bad messages (you will regret these in six months):
- `update`
- `fix stuff`
- `WIP`
- `changes`

Good messages:
- `Add README with project description`
- `Fix login redirect loop when session expires`
- `Remove deprecated search endpoint — no longer called after auth refactor`


> **Why this matters in a real job:** When something breaks in production at 2am, the first thing you do is `git log` to see what changed recently. A log full of `fix stuff` and `update` is useless. A log full of precise messages tells you exactly where to look.

## Seeing Your History

```bash
git log
```

Shows every commit: SHA hash, author, date, message.

```bash
git log --oneline
```

Compact view — one line per commit. This is what you will use most day-to-day.

## Why commits can help

Let us put it together. You have two commits. You edit `README.md` and accidentally delete the important line.

```bash
# See what changed since last commit
git diff

# Discard the accidental change, restore from last commit
git restore README.md
```

`README.md` is back to exactly how it was in your last commit. This works because Git has that snapshot.

This is the core value of Git: every commit is a restore point. The discipline of committing regularly — with clear messages — is what makes recovery fast when things go wrong.

> **Try This:** Create a file, commit it. Then deliberately break it (delete a line, add garbage). Run `git diff` to see the damage. Run `git restore <filename>` to undo it. Run `git log --oneline` to see your restore point is still there.

## Key Takeaways

- `git init` creates a `.git` folder that stores all history — delete it and you lose everything
- Files live in three areas: working directory → staging area → repository
- `git add` stages; `git commit` saves permanently
- Write commit messages for the 2am you who forgot what you changed and why
- Every commit is a restore point — `git restore <file>` undoes uncommitted damage
