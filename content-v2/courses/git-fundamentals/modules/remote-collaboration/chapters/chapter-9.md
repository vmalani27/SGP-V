# Chapter 9: Reading the Project's Story

## In this chapter, you will

- Navigate commit history efficiently
- Search for specific changes by message, file, or content
- Compare versions of your project to understand what changed

## Why History Is a Debugging Tool

Something broke. You need to figure out when it broke and who changed it. Without Git history, this means reading through every file manually. With Git history, you can pinpoint the exact commit that introduced the problem in seconds.

Learning to read and search your project's history is one of the most practical Git skills you can develop.

## Browsing History With `git log`

The `git log` command shows your commit history. The default output is detailed but verbose. Here are the views you will actually use:

| Command | What You Get |
|---------|-------------|
| `git log --oneline` | One line per commit — compact and scannable |
| `git log --oneline --graph` | Visual branch/merge diagram alongside the log |
| `git log -n 5` | Only the last 5 commits |
| `git log --since="2 weeks ago"` | Commits from the last two weeks |
| `git log --author="Alice"` | Only commits by a specific author |

The `--graph` flag is especially useful after merges. It draws an ASCII diagram showing how branches diverged and came back together.

## Searching by Commit Message

If you remember part of a commit message, search for it:

```
git log --grep="login"
```

This finds all commits whose message contains "login". Useful when you know *what* was fixed but not *when*.

## Searching by File

To see the history of a specific file:

```
git log -- src/api/auth.js
```

This shows every commit that touched `auth.js`. When a bug appears in a file, this is the fastest way to see what changed recently.

## Searching by Content (Pickaxe Search)

The most powerful search. To find when a specific string was added or removed from any file:

```
git log -S "functionName"
```

This searches the actual content of changes. If you see a function being called but do not know where it is defined, `-S` will find the commit that introduced it.

## Comparing Changes

### `git diff` — What Changed?

| Command | Shows |
|---------|-------|
| `git diff` | Changes in your working directory (unstaged) |
| `git diff --staged` | Changes that are staged but not yet committed |
| `git diff main..feature/search` | All changes between two branches |
| `git diff A1B2C3D..E4F5G6H` | Changes between two specific commits |

### `git show` — Full Commit Details

To see everything about a single commit — the message, author, date, and the actual diff:

```
git show <commit-hash>
```

Combine it with `--stat` for a summary of which files changed:

```
git show --stat <commit-hash>
```

> **Tip:** When reviewing a pull request, start with `git log --oneline main..feature-branch` to see all the commits in the branch. Then use `git show` on individual commits to review the details.

> **Try This:** Run `git log --oneline --graph` on a repository with a few merges. Trace the visual diagram with your finger. Find the merge commit where two branches came together. Then use `git show` on that merge commit to see both parent commits.

## Key Takeaways

- `git log --oneline` is your go-to for browsing history quickly
- Search by message (`--grep`), by file (`-- <file>`), or by content (`-S`)
- `git diff` compares any two points — working directory, staging area, branches, or commits
- `git show` gives you the full details of a single commit
