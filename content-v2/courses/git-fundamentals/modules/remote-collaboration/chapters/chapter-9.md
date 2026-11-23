# Chapter 9: Collaborating with Remotes

## Beyond One-Way Pushing

In earlier chapters, you connected local repositories to `origin` and published commits outward using `git push`—and used `git push --force` in Chapter 6 when you intentionally rewrote history to purge a leaked secret.

Up to this point, changes have only moved in one direction: from your working directory to the remote server. On a team, however, the remote repository is a shared target. Teammates push commits to `origin` while you are working locally, and you often join projects that already exist on the server rather than starting from `git init`.

Working with a shared remote requires three capabilities beyond `git push`:
- Starting local work from an existing remote repository (`git clone`)
- Inspecting and downloading commits pushed by others (`git fetch` and `git pull`)
- Reconciling diverged history when a push is rejected without overwriting teammates' commits

## Starting from an Existing Remote: `git clone`

In Chapter 2, you created a repository from scratch with `git init` and manually registered the remote using `git remote add origin <url>`. When a project already exists on the server, `git clone` performs the entire setup in one command.

First, publish the pre-configured `~/practice` repository to the local Git server so it exists on the remote:

```bash
cd ~/practice
git push -u origin main
```

Now clone a second working copy of that repository into `~/practice-teammate` to simulate a second developer's machine:

```bash
cd ~
git clone http://git-server:3000/student/practice.git practice-teammate
cd ~/practice-teammate
```

When you run `git clone`, Git:
1. Creates the target directory (`~/practice-teammate`) and initializes `.git`
2. Downloads the full commit history and branches from the server
3. Registers the source URL under the remote alias `origin`
4. Checks out the default branch (`main`) configured to track `origin/main`

Verify the configured remote URLs:

```bash
git remote -v
```

```text
origin  http://git-server:3000/student/practice.git (fetch)
origin  http://git-server:3000/student/practice.git (push)
```

## Remote-Tracking Branches and `git fetch`

Suppose your teammate commits and pushes an update from `~/practice-teammate`:

```bash
cd ~/practice-teammate
echo "timeout = 30" > config.py
git add config.py
git commit -m "Add default request timeout configuration"
git push origin main
```

Now switch back to your original repository in `~/practice` and check its status:

```bash
cd ~/practice
git status
```

Git reports:

```text
On branch main
Your branch is up to date with 'origin/main'.
```

Why does Git claim `main` is up to date when a new commit is already on the server? Because `origin/main` is a **remote-tracking branch** stored locally inside your `.git` directory. It records where the server's `main` branch pointed the last time your repository communicated with `origin`. Git does not contact the network during `git status`.

To ask the server for new commits without modifying your working directory or local `main` branch, run `git fetch`:

```bash
git fetch origin
```

Now run `git status` again:

```bash
git status
```

```text
On branch main
Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.
```

Because `git fetch` downloaded the new commits into `origin/main` without merging them into `main`, you can inspect what your teammate changed before integrating it:

```bash
git log --oneline main..origin/main
git diff main..origin/main
```

Once you have reviewed the incoming commits, merge `origin/main` into your active branch:

```bash
git merge origin/main
```

## `git fetch` vs. `git pull`

When you do not need to pause and inspect incoming commits separately, `git pull` combines `git fetch` and `git merge` into a single step:

| Command | Effect on `origin/main` | Effect on Local `main` and Working Tree |
| :--- | :--- | :--- |
| `git fetch origin` | Updates `origin/main` with new commits from the server | Leaves local `main` and working files untouched |
| `git pull origin main` | Updates `origin/main` with new commits from the server | Immediately merges `origin/main` into your current branch |

Use `git fetch` when you want to review incoming changes before modifying your working tree. Use `git pull` when you want to bring your local branch up to date immediately.

## Handling Rejected Pushes on Shared Branches

What happens if a teammate pushes a commit to `origin/main` while you are also creating a new commit on your local `main`?

Simulate this in the terminal. First, create and push a commit from `~/practice-teammate`:

```bash
cd ~/practice-teammate
echo "max_retries = 3" >> config.py
git commit -am "Add max_retries setting"
git push origin main
```

Next, return to `~/practice` (which does not have that commit yet), make a local commit to `README.md`, and try to push:

```bash
cd ~/practice
echo "Service documentation" >> README.md
git commit -am "Add service documentation note to README"
git push origin main
```

Git rejects the push:

```text
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to 'http://git-server:3000/student/practice.git'
hint: Updates were rejected because the remote contains work that you do
hint: not have locally.
```

### Why `git push --force` Is Wrong Here

In Chapter 6, `git push` failed with a similar rejection after you ran `git reset HEAD~1`, and you used `git push --force` to overwrite `origin/main`. In that scenario, you were deliberately erasing your own leaked commit.

Here, `origin/main` rejected your push because a teammate published a legitimate commit (`Add max_retries setting`) that your local history does not contain. Running `git push --force` would overwrite `origin/main` with your local branch and **erase your teammate's commit from the remote branch**.

### Reconciling Diverged History with `git pull`

To publish your work without losing your teammate's commit, pull the remote changes into your local branch first:

```bash
git pull origin main --no-edit
```

Git fetches `origin/main` and merges it with your local commit. If both commits modified the same lines of the same file, Git pauses with conflict markers so you can resolve the conflict (just as in Chapter 8) and commit the merge. Once the remote changes are integrated into your local history, push normally:

```bash
git push origin main
```

Both your teammate's commit and your commit are now preserved on `origin/main`.

## Key Takeaways

- `git clone <url>` downloads a remote repository, checks out its default branch, and configures `origin` automatically.
- `origin/main` is a local bookmark recording the last known position of the remote's `main` branch.
- `git fetch origin` downloads new remote commits and updates `origin/main` without changing your working files, allowing you to inspect incoming work with `git log main..origin/main`.
- `git pull origin main` fetches remote commits and merges them into your current branch in one step.
- When `git push` is rejected on a shared branch because a teammate pushed first, run `git pull` to integrate their commits before pushing—reserve `git push --force` strictly for intentional history rewrites on branches you control.
