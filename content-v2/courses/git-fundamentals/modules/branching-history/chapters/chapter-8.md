# Chapter 8: Bringing Work Together

:::
> **Before this chapter:** You should be comfortable creating, switching, and committing on branches (`git branch`, `git switch`) from Chapter 7.

## The Situation

You and a teammate both branch off `main` on Monday morning to work on different tasks. You add a request timeout in `config.py`. Your teammate modifies the database connection pool in the same section of `config.py` and merges their branch into `main` on Tuesday afternoon.

When you finish your work and try to merge your branch into `main`, Git encounters conflicting modifications to the exact same lines. It cannot guess whether your timeout should replace the pool configuration, come after it, or be discarded.

Merging is the mechanism for combining the histories of separate branches. When changes touch different files or different lines, Git merges them automatically. When changes overlap, Git pauses and hands control to you.

## How Git Decides: Merge Base and Graph Traversal

When you run `git merge feature/timeout` from `main`, Git identifies three commits in the graph:

```
        C --- D  (feature/timeout)
       /
A --- B          (merge base)
       \
        E        (main, HEAD)
```

1. **The merge base (`B`)**: The most recent ancestor commit shared by both branches.
2. **Current branch tip (`E`)**: Where `main` currently points.
3. **Target branch tip (`D`)**: The latest commit on `feature/timeout`.

Git compares the changes introduced between `B` and `E` against the changes introduced between `B` and `D`.

## Fast-Forward Merges

If `main` has not moved since you created the feature branch, no divergent work exists:

```
Before merge:
main:     A --- B
                 \
feature:          C --- D (HEAD -> feature/timeout)

Command:
git switch main
git merge feature/timeout

After merge:
main:     A --- B --- C --- D (HEAD -> main, feature/timeout)
```

Because `B` was both the merge base and the tip of `main`, Git does not need to reconcile two histories. It performs a **fast-forward**: it advances the `main` pointer directly to commit `D`. No new commit is created, and the commit history remains linear.

If your team policy requires an explicit merge commit even for non-divergent branches, you can enforce it with:

```bash
git merge --no-ff feature/timeout
```

## Three-Way Merges

When both branches have new commits since diverging, a simple pointer move is impossible:

```
Before merge:
main:     A --- B --- E (HEAD -> main)
                 \
feature:          C --- D

Command:
git merge feature/timeout

After merge:
main:     A --- B --- E ------- M (HEAD -> main)
                 \             /
feature:          C --- D ----
```

Git reads the snapshot at merge base `B`, applies the non-overlapping diffs from both `E` and `D`, and creates a new **merge commit (`M`)**. Merge commit `M` has two parents: `E` and `D`.

If there are no overlapping changes, Git opens your editor to write a commit message (or uses a default like `Merge branch 'feature/timeout'`), and completes the merge automatically.

## Resolving Merge Conflicts

When both branches alter the exact same lines in a file, Git halts the merge process and reports the conflict:

```
Auto-merging config.py
CONFLICT (content): Merge conflict in config.py
Automatic merge failed; fix conflicts and then commit the result.
```

Check the repository status:

```bash
git status
```

```
Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   config.py
```

### The Conflict Markers

Open `config.py` in your editor. Git marks the collision with conflict markers:

```python
def configure_app():
<<<<<<< HEAD
    # Your current branch (main)
    db_pool_size = 20
    db_timeout = 30
=======
    # The incoming branch (feature/timeout)
    request_timeout = 5.0
>>>>>>> feature/timeout
    return True
```

The syntax follows a fixed structure:
- `<<<<<<< HEAD`: Marks the start of the lines present on your current branch (`main`).
- `=======`: The separator between the two conflicting versions.
- `>>>>>>> feature/timeout`: Marks the end of the incoming branch's changes.

### Resolution Steps

1. **Edit the file**: Remove the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) and combine the logic so both required settings are retained:
   ```python
   def configure_app():
       db_pool_size = 20
       db_timeout = 30
       request_timeout = 5.0
       return True
   ```
2. **Stage the resolved file**:
   ```bash
   git add config.py
   ```
   Staging the file informs Git that the conflict on that path is resolved.
3. **Complete the merge**:
   ```bash
   git commit
   ```
   Git automatically generates a commit message identifying the merged branch and conflicts resolved. Save and close the editor.

### Aborting a Merge

If you run into an unexpected conflict or need to verify the code before continuing, return the repository to the state prior to running `git merge`:

```bash
git merge --abort
```

This clears all conflict markers and restores your working directory to the commit where `HEAD` was before the merge was attempted.

## How Teams Use This

**Pull Request Merge Strategies.** When merging branches on GitHub, GitLab, or Bitbucket, teams configure one of three merge strategies:
- **Create a merge commit (`git merge --no-ff`)**: Retains all commits from the feature branch plus an explicit merge commit tying the two lines together.
- **Squash and merge**: Condenses all commits on the feature branch into a single commit on `main`. Keeps `main` history clean while discarding intermediate checkpoint commits.
- **Rebase and merge**: Replays feature branch commits on top of `main`, preserving individual commits with linear history.

**Short-Lived Branches.** The longer a branch diverges from `main`, the larger the volume of conflicting code accumulated across the team. Merging branches within 1–2 days and regularly pulling updates from `main` into your feature branch keeps conflicts small and localized to recent edits.

**CI Validation on Merge Branches.** Modern CI platforms do not just test your feature branch tip; they create a temporary merge commit between your branch and `main` (`refs/pull/<id>/merge`) and run tests against the synthesized result. This detects semantic conflicts (where Git merges code without syntax errors, but the combined logic breaks tests) before the PR is approved.

## Key Takeaways

- Fast-forward merges move the branch pointer directly forward when history has not diverged.
- Three-way merges create a merge commit with two parents when both branches have unique commits.
- Conflicts occur when separate branches change the same lines of a file; Git marks the collision with `<<<<<<<`, `=======`, and `>>>>>>>`.
- Resolve conflicts by editing the file, deleting the markers, staging with `git add`, and running `git commit`.
- `git merge --abort` cancels a merge in progress and restores the repository state before the merge began.
