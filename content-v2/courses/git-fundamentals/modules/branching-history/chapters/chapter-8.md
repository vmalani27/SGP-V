# Chapter 8: Bringing Work Together

## The Merge Model

Merging combines the histories of separate branches. When changes touch different files or separate sections of the same file, Git reconciles them automatically. When independent branches modify the exact same lines, Git pauses and delegates the decision to the developer.

### Merge Base and Graph Traversal

When merging a target branch (`feature/config`) into your active branch (`main`), Git analyzes three key points in the commit graph:

```text
        C --- D  (feature/config)
       /
A --- B          (merge base)
       \
        E        (main, HEAD)
```

1. **The merge base (`B`)**: The most recent common ancestor shared by both branches.
2. **The current branch tip (`E`)**: The latest commit on your active branch (`main`).
3. **The incoming branch tip (`D`)**: The latest commit on the branch being integrated.

Git compares the changes introduced between `B` and `E` against the changes introduced between `B` and `D`.

### Fast-Forward vs. Three-Way Merge

- **Fast-Forward Merge**: If the active branch has not advanced since diverging (commit `E` does not exist; `main` is still at `B`), Git simply moves the `main` pointer forward to `D`. No new commit is generated.
- **Three-Way Merge**: If both branches contain independent commits since diverging (`E` and `D` both exist), Git applies the combined diffs and generates a new **merge commit**. A merge commit has two parent commits: `E` and `D`.

---

## Terminal Experiment: Merges and Conflict Resolution

Switch to your terminal to observe how Git executes both merge modes in your practice repository.

### Step 1: Execute a fast-forward merge

Navigate to `~/practice` and verify a clean working tree:

```bash
cd ~/practice
git restore .
git status
```

Create a feature branch and add a default port setting to `api.py`:

```bash
git switch -c feature/config
echo "PORT = 8080" >> api.py
git commit -am "Add default port configuration"
```

Switch back to `main` and integrate the change:

```bash
git switch main
git merge feature/config
```

Output:
```text
Updating a681b65..ff5c693
Fast-forward
 api.py | 1 +
 1 file changed, 1 insertion(+)
```

Because `main` remained stationary at the merge base, Git fast-forwarded `main` directly to the feature commit. Clean up the merged branch:

```bash
git branch -d feature/config
```

### Step 2: Create divergent commits to trigger a conflict

Now introduce conflicting changes to the same line from two separate branches.

First, update the port setting directly on `main`:

```bash
echo "PORT = 9000" >> api.py
git commit -am "Update production port to 9000"
```

Next, create a new branch from the previous commit (`HEAD~1`) simulating a teammate working in parallel:

```bash
git checkout -b feature/port-override HEAD~1
echo "PORT = 3000" >> api.py
git commit -am "Update staging port to 3000"
```

Now return to `main` and attempt to merge the divergent branch:

```bash
git checkout main
git merge feature/port-override
```

Git detects the collision and halts:

```text
Auto-merging api.py
CONFLICT (content): Merge conflict in api.py
Automatic merge failed; fix conflicts and then commit the result.
```

### Step 3: Inspect the conflicted state

Check the repository status:

```bash
git status
```

Output:
```text
You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   api.py
```

Inspect the conflicting file:

```bash
cat api.py
```

At the bottom of `api.py`, Git inserted conflict markers:

```text
<<<<<<< HEAD
PORT = 9000
||||||| ff5c693
=======
PORT = 3000
>>>>>>> feature/port-override
```

### Understanding Conflict Markers

- `<<<<<<< HEAD`: Marks the start of the changes from your current branch (`main`).
- `||||||| <hash>`: Displays the original content from the common ancestor merge base (shown when `merge.conflictStyle` is set to `diff3`).
- `=======`: Separates the current branch's lines from the incoming branch's lines.
- `>>>>>>> feature/port-override`: Marks the end of the incoming branch's changes.

### Step 4: Resolve the conflict and finalize the merge

To resolve the conflict:
1. Edit `api.py` to remove all marker lines (`<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`).
2. Keep the desired final setting. For example, keep `PORT = 9000`.

Update `api.py` with the resolved content:

```bash
sed -i '/<<<<<<</,/>>>>>>>/c\PORT = 9000' api.py
cat api.py
```

Stage the resolved file to notify Git that the collision has been handled:

```bash
git add api.py
```

Check status to verify that the file moved to staged changes:

```bash
git status
```

Complete the merge commit:

```bash
git commit -m "Merge branch feature/port-override with resolved port configuration"
```

Inspect the resulting commit graph:

```bash
git log --oneline --graph -n 4
```

Notice the graph topology: the new commit unites both parent branches into a single timeline. Clean up the feature branch:

```bash
git branch -d feature/port-override
```

---

## Aborting a Merge

If a merge encounters complex conflicts and you need to discard the in-progress merge state without saving changes, run:

```bash
git merge --abort
```

Git removes all conflict markers and restores both the working tree and index to the exact state of `HEAD` before `git merge` was executed.

---

## Production Team Workflows

### Pull Request Merge Strategies

When merging branches on shared platforms (GitHub, GitLab, Bitbucket), teams configure one of three primary merge strategies:

- **Create a merge commit (`git merge --no-ff`)**: Preserves all individual feature commits plus an explicit merge commit documenting the integration point.
- **Squash and merge**: Condenses all commits from the feature branch into a single commit on `main`. Keeps `main`'s history linear while removing intermediate checkpoint commits.
- **Rebase and merge**: Replays feature branch commits sequentially on top of the latest `main`, creating a linear commit history without a separate merge commit.

### Branch Lifetime and Semantic Conflicts

Keep feature branches small and short-lived. Long-running branches accumulate divergence against `main`, increasing the probability and scope of merge collisions.

Automated CI systems create temporary merge commits between incoming branches and `main` (`refs/pull/<id>/merge`) to run test suites. This catches **semantic conflicts**—cases where Git merges files without syntax errors, but the combined logic breaks application tests—before the PR is merged.

---

## Key Takeaways

- **Merge base:** The common ancestor commit Git uses to evaluate three-way file diffs.
- **Fast-forward merge:** Advances the branch pointer directly forward when the base branch has not diverged.
- **Three-way merge:** Generates a merge commit with two parents when both branches contain independent commits.
- **Conflict resolution:** Delete conflict markers, retain the intended code, stage with `git add`, and finalize with `git commit`.
- **Merge cancellation:** `git merge --abort` clears an in-progress merge and restores the repository state prior to the merge command.
