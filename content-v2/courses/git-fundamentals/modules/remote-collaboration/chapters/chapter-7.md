# Chapter 7: Sharing Your Work

## In this chapter, you will

- Understand what remotes are and how they work
- Push your code to a remote repository
- Pull changes from teammates without losing your work
- Handle rejected pushes

## Why Remotes Matter

Everything so far has been local — your commits, your branches, your history. But software is built by teams. You need a way to share your work with others and get their changes. That is what remotes are for.

A remote is a Git repository hosted somewhere else — usually on GitHub, GitLab, or Bitbucket. Your local repository connects to it, and you push and pull changes between them.

## Cloning: Getting a Remote Repository

When you clone a repository, Git downloads the entire project history and sets up a connection to the remote. The default remote name is `origin`.

```
git clone https://github.com/your-team/project.git
```

This creates a folder called `project`, downloads all the history, and sets `origin` as the remote. You can verify this:

```
git remote -v
```

You will see `origin` listed with fetch and push URLs.

## The Push-Pull Cycle

The collaboration workflow follows a simple rhythm:

1. **Pull** the latest changes from the remote
2. **Work** locally — create branches, make commits
3. **Push** your commits to the remote so others can see them

To push your changes:

```
git push origin main
```

To pull the latest changes:

```
git pull origin main
```

> **Tip:** Always pull before you start working. This ensures your local `main` is up to date. If you forget and try to push, Git may reject your push because someone else pushed first.

## Fetch vs. Pull

These two commands sound similar but have an important difference:

| Command | What It Does |
|---------|-------------|
| `git fetch origin` | Downloads new data from the remote but does NOT merge it into your files |
| `git pull origin main` | Downloads AND merges remote changes into your current branch |

Use `git fetch` when you want to see what changed before integrating it. Use `git pull` when you are ready to update immediately.

To see what `fetch` downloaded before merging:

```
git fetch origin
git log main..origin/main
```

This shows you the commits that are on the remote but not yet in your local `main`.

## Handling Rejected Pushes

If you try to push and Git rejects it, it usually means someone else pushed changes to the same branch before you did. Your local branch is behind the remote.

The fix:

```
git pull origin main
# Resolve any conflicts if they arise
git push origin main
```

Pull first, resolve conflicts if needed, then push. This keeps the remote history moving forward without losing anyone's work.

> **Warning:** Never force-push (`git push --force`) to a shared branch like `main`. It overwrites the remote history and can destroy other people's commits. Force-push is only safe on your own personal branches that nobody else is working on.

> **Try This:** Create a repository on GitHub. Clone it locally. Make a commit and push it. Then make another commit and push again. Verify both commits appear on GitHub by checking the repository's commit history.

## Key Takeaways

- A remote is a Git repository hosted on a server (GitHub, GitLab, etc.)
- `git clone` sets up `origin` as the default remote automatically
- `git push` sends your commits; `git pull` downloads and merges remote changes
- `git fetch` downloads without merging — useful for reviewing changes first
- Pull before you push to avoid rejected pushes
