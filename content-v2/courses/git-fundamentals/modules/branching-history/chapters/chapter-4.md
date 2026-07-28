# Chapter 4: Fixing Mistakes Without Panic

## In this chapter, you will

- Discard changes you do not want
- Undo staging without losing work
- Fix the last commit before anyone sees it
- Recover from mistakes using the reflog

## Git Is Built for Recovery

One of Git's best qualities is that almost nothing is permanent until you push it to a shared repository. Made a mistake? Git has a way to undo it. This chapter teaches you the safety nets.

The key insight: Git has different undo tools depending on *where* your changes are. Are they in your working directory? In the staging area? Already committed? Each situation has a different fix.

## Level 1: Discarding Unstaged Changes

You edited a file but have not staged it yet. You want to throw away those changes and go back to the last committed version:

```
git restore <file>
```

This permanently discards the changes in that file. There is no undo for this — but since the changes were never committed, Git still has the previous version in its history.

> **Warning:** `git restore` is a one-way door. The changes you discard are gone. Make sure you actually want to throw them away.

## Level 2: Unstaging a Staged File

You ran `git add` on a file but changed your mind. You want to unstage it without losing the changes:

```
git restore --staged <file>
```

The file stays modified in your working directory. It moves from the staging area back to the working directory. Nothing is lost — you just moved it out of the "ready to commit" zone.

## Level 3: Fixing the Last Commit

You just committed and realized you forgot a file, or the commit message has a typo. You can amend the last commit:

```
git commit --amend -m "Corrected commit message"
```

If you forgot to add a file:

```
git add forgotten-file.js
git commit --amend --no-edit
```

The `--no-edit` flag keeps the original commit message. The forgotten file gets added to the commit you just made.

> **Warning:** Only amend commits that have not been pushed yet. If you amend a pushed commit, you rewrite history. Other developers who pulled the original commit will have a diverged history, which causes problems.

## The Reflog: Your Ultimate Safety Net

Git records every movement of `HEAD` (your current position in history) in something called the **reflog**. Even if you reset to an earlier commit and think you lost work, the reflog remembers where you were.

```
git reflog
```

This shows a list of every action you have taken. You can use it to get back to any previous state:

```
git checkout <sha-hash-from-reflog>
```

Think of the reflog as Git's undo history. It is local to your machine and expires after 90 days, but within that window it can save you from almost any mistake.

> **Try This:** Make a commit, then use `git restore <file>` to discard a change. Notice the file reverts. Then make another commit and use `git commit --amend` to change its message. Run `git log --oneline` to see the updated message.

## The Decision Tree

Here is how to choose the right undo tool:

| Situation | Command |
|-----------|---------|
| Changed a file, not staged | `git restore <file>` |
| Staged a file, want to unstage | `git restore --staged <file>` |
| Committed, want to fix message or add file | `git commit --amend` |
| Committed, want to undo entirely | `git revert <commit>` or `git reset <commit>` |

## Key Takeaways

- `git restore` discards unstaged changes (permanent — be sure)
- `git restore --staged` unstages a file without losing changes
- `git commit --amend` fixes the most recent commit
- The reflog records every HEAD movement and can recover seemingly lost work
