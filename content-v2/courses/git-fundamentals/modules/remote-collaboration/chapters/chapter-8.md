# Chapter 8: Pausing Without Losing

## In this chapter, you will

- Save work-in-progress without committing
- Restore stashed changes when you are ready
- Understand when stashing is useful and when it is not

## The Scenario

You are halfway through a feature. Your code is not in a state you want to commit — half the tests are broken, half the function is written. Then your manager tells you there is an urgent bug in production that needs fixing right now.

You need to switch to `main`, create a fix branch, and push a hotfix. But you have uncommitted changes that would come with you to `main` and create a mess.

Stashing is the answer. It temporarily saves your uncommitted changes and gives you a clean working directory.

## How Stashing Works

When you run `git stash`, Git takes your staged and unstaged changes, saves them to a special stash area, and reverts your working directory to the last commit (clean state).

```
git stash
```

Your working directory is now clean. You can switch branches, pull changes, or do whatever you need.

When you are ready to continue where you left off:

```
git stash pop
```

This restores your stashed changes and removes them from the stash. It is like picking up exactly where you paused.

## The Stash Stack

The stash is a stack — each new stash goes on top. You can have multiple stashes:

```
git stash list
```

This shows all stashes with an index number. The most recent is at the top (stash@{0}).

To apply a specific stash without removing it:

```
git stash apply stash@{2}
```

To remove a specific stash:

```
git stash drop stash@{2}
```

To clear all stashes:

```
git stash clear
```

## Pop vs. Apply

| Command | What It Does |
|---------|-------------|
| `git stash pop` | Applies the most recent stash AND removes it from the stash list |
| `git stash apply` | Applies the most recent stash but keeps it in the stash list |

Use `pop` when you are done with the stash. Use `apply` when you want to use the same stash on multiple branches.

## Stashing Untracked Files

By default, `git stash` only saves changes to tracked files. New files that Git has never seen are left behind. To include them:

```
git stash --include-untracked
```

> **Tip:** If you stashed something and forgot which stash it was, run `git stash list` and then `git stash show -p stash@{0}` to see the actual diff of a stash without applying it.

> **Warning:** Stashing is not a substitute for committing. If you have work you want to keep long-term, commit it — even on a work-in-progress branch. Stashes are temporary bookmarks, not permanent storage.

> **Try This:** Modify a file, then run `git stash`. Verify your working directory is clean with `git status`. Then run `git stash pop` and verify your changes are back. Try the same flow but with `git stash apply` instead, and notice the stash stays in the list.

## Key Takeaways

- `git stash` temporarily saves uncommitted changes and cleans your working directory
- `git stash pop` restores and removes; `git stash apply` restores and keeps
- The stash is a stack — use `git stash list` to see all stashes
- Stashing is for temporary pauses, not for long-term storage
