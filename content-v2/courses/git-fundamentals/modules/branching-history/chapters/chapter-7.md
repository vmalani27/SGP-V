# Chapter 7: Working in Parallel

## Why Teams Branch

When developers collaborate on a shared codebase, committing directly to `main` creates immediate chaos. A half-finished feature mixed with an in-progress bugfix destabilizes the build for everyone on the team.

The industry-standard solution is the **feature-branch workflow**:
1. You branch off `main` to work in complete isolation.
2. `main` remains clean, stable, and deployable.
3. Once your feature is finished and verified, it is merged back into `main`.

A branch in Git is a lightweight, movable pointer to a specific commit.

```text
main:       A --- B
                   \
feature:            C --- D (HEAD)
```

In this diagram, commits `A` and `B` represent shared history. Your feature branch diverged at `B` and added `C` and `D`. Until you merge, `main` knows nothing about those changes.

---

## Terminal Experiment: Creating and Committing on an Isolated Branch

Switch to your terminal to observe how Git manages branch isolation in your practice repository.

### Step 1: Check your baseline state

Navigate to `~/practice` and ensure you start from a clean working tree:

```bash
cd ~/practice
git restore .
git status
```

List existing branches:

```bash
git branch
```

The asterisk `*` indicates that `HEAD` currently points to `main`:

```text
* main
```

### Step 2: Create and switch to a feature branch

Use `git switch -c` to create a new branch and switch to it in a single command:

```bash
git switch -c feature/health-check
```

Confirm that your active branch has changed:

```bash
git branch
```

Output:
```text
* feature/health-check
  main
```

Any commits you make now will only advance `feature/health-check`. The `main` branch remains stationary at its current commit.

### Step 3: Make a commit on your feature branch

Add a new function to `api.py`:

```bash
echo "def health(): pass" >> api.py
```

Inspect the modified code:

```bash
git diff api.py
```

Commit the change to your feature branch:

```bash
git commit -am "Add health check endpoint"
```

Inspect your recent branch history:

```bash
git log --oneline -n 2
```

The top commit now belongs to `feature/health-check`.

---

## The Core Discovery: Working Tree Isolation

Now observe Git's branch switching behavior in action.

### Step 1: Switch back to `main`

Switch your branch pointer back to `main`:

```bash
git switch main
```

Now inspect the end of `api.py`:

```bash
tail -n 5 api.py
```

The `health()` function is no longer present in `api.py`.

Git restored the working tree to the exact snapshot recorded by `main`. The new code remains recorded on `feature/health-check`.

Verify `main`'s commit history:

```bash
git log --oneline -n 2
```

`main` still points to the initial commit.

### Step 2: Visualize branch divergence

View all branch tips simultaneously in your commit graph:

```bash
git log --oneline --all --graph
```

Output:
```text
* 347560d (feature/health-check) Add health check endpoint
* a681b65 (HEAD -> main) Initial application release
```

`feature/health-check` is one commit ahead of `main`.

### Step 3: Switch back to restore your work

Switch back to the feature branch:

```bash
git switch feature/health-check
tail -n 5 api.py
```

The `health()` function immediately reappears in your file.

---

## Under the Hood: Branch Pointers in `.git`

Why is branch creation and switching practically instantaneous in Git, even in codebases with millions of lines of code?

Inspect Git's internal branch storage:

```bash
cat .git/HEAD
```

Output:
```text
ref: refs/heads/feature/health-check
```

`HEAD` is simply a text pointer indicating your active branch.

Now inspect the branch references themselves:

```bash
cat .git/refs/heads/feature/health-check
cat .git/refs/heads/main
```

Each branch file contains a 40-character commit SHA plus a newline (41 bytes total). Branch creation and switching update pointer references rather than duplicating files, keeping operations fast regardless of repository size.

---

## Merging and Cleaning Up

When a feature is finished and verified, you bring its changes into `main` and delete the temporary branch.

### Step 1: Fast-forward merge

Switch to the destination branch (`main`) and merge:

```bash
git switch main
git merge feature/health-check
```

Output:
```text
Updating a681b65..347560d
Fast-forward
 api.py | 1 +
 1 file changed, 1 insertion(+)
```

Because `main` did not acquire any new commits while you worked, Git performed a **fast-forward**: it simply slid the `main` pointer forward to match `feature/health-check`.

Verify that `main` now contains the new commit:

```bash
git log --oneline -n 2
```

### Step 2: Delete the obsolete branch

Once a branch is merged, clean it up:

```bash
git branch -d feature/health-check
```

Git allows `-d` only when all changes are fully merged into the current branch. If a branch contains unmerged commits that you intentionally want to discard, Git requires the uppercase `-D` flag (`git branch -D <branch>`).

Verify with `git branch` that only `main` remains:

```bash
git branch
```

---

## Professional Team Workflow

In real production environments, branching follows structured conventions:

| Prefix | Purpose | Example |
| :--- | :--- | :--- |
| `feature/` | Developing new user-facing functionality | `feature/oauth-login` |
| `fix/` or `bugfix/` | Resolving an identified bug | `bugfix/session-timeout` |
| `hotfix/` | Critical production patch branched from main | `hotfix/security-cve-patch` |
| `chore/` | Tooling, build config, or dependency update | `chore/upgrade-python-312` |

### The Pull Request Lifecycle

On a team, branches are the foundation for code review and automated CI:

1. **Branch locally**: `git switch -c feature/oauth-login`
2. **Push to remote**: `git push -u origin feature/oauth-login`
3. **Open Pull Request (PR)**: Request teammates to review your diff before merging into `main`.
4. **CI Verification**: Automated pipelines run unit tests and linters against your branch.
5. **Merge & Delete**: Once approved and green, the branch merges into `main` and is deleted.

Keep feature branches small and short-lived. A branch that lives for two days and touches three files merges cleanly; a branch that diverges for a month creates painful merge conflicts.

---

## Key Takeaways

- **Branch references:** A branch is a named pointer to a specific commit SHA stored in `.git/refs/heads/`.
- **Branch creation:** `git switch -c <name>` creates and checks out a new branch in a single command.
- **Working tree isolation:** `git switch` updates local files to match the snapshot of the selected branch.
- **Fast-forward merge:** When the base branch has no divergent commits, `git merge` advances the branch pointer forward without generating a merge commit.
- **Branch cleanup:** `git branch -d <name>` deletes a merged branch reference.
