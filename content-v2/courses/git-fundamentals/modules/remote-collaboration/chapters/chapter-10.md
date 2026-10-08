# Chapter 10: Pausing Without Losing

> **Prerequisites:** You should understand branches and commits. Stashing is specifically for the moment between two: when you are mid-work on one branch and something urgent forces you to switch.

## The Exact Scenario (This Will Happen to You)

It is a Tuesday afternoon. You are halfway through adding a new feature — three files modified, nothing committed because the code does not work yet. Your manager messages you: "Production is down, there's a null pointer exception in the payment flow, we need a hotfix in 20 minutes."

You need to switch to `main`, branch off a hotfix, fix the bug, push, open a PR, and get it deployed. Right now.

The problem: your half-written feature is sitting in your working directory as uncommitted changes. If you switch branches, Git may carry those changes with you — mixing your unfinished feature into the hotfix branch. That is not acceptable.

`git commit` is not the right answer — you are not ready to commit, the code is broken.
`git checkout -- .` throws everything away — also not acceptable.

`git stash` is the answer.

## How Stashing Works

`git stash` snapshots your current uncommitted changes, saves them to a temporary area, and restores your working directory to its last committed state — clean.

```bash
# You are mid-feature, files are messy
git stash

# Your working directory is now clean (git status shows nothing)
# Switch to main, create hotfix branch, fix, push
git switch main
git switch -c hotfix/payment-null-pointer
# ... fix the bug ...
git add .
git commit -m "Fix null pointer in payment flow when cart is empty"
git push origin hotfix/payment-null-pointer
# open PR, get it merged

# Now go back to your feature
git switch feature/my-feature
git stash pop
# Your half-written code is back exactly as you left it
```

That is the complete pattern. Stash → switch → fix → push → switch back → pop.

## The Stash Is a Stack

You can stash multiple times. Each stash goes on top.

```bash
git stash list
# stash@{0}: WIP on feature/my-feature: abc1234 Last commit message
# stash@{1}: WIP on feature/other-thing: def5678 Another commit
```

To restore a specific stash without removing it:

```bash
git stash apply stash@{1}
```

To remove a specific stash:

```bash
git stash drop stash@{1}
```

To clear everything:

```bash
git stash clear
```

## Pop vs. Apply

| Command | Restores changes | Keeps stash in list |
|---|---|---|
| `git stash pop` | Yes | No — removes it |
| `git stash apply` | Yes | Yes — keeps it |

Use `pop` when you are done with the stash and want it gone. Use `apply` when you want to apply the same stashed changes to multiple branches (rare, but valid for patches).

## One Important Limitation

By default, `git stash` only saves changes to **tracked files** — files Git already knows about. New files you just created and never staged are left behind.

```bash
# To stash everything including new untracked files
git stash --include-untracked
```

If you are mid-feature and created a new file, use `--include-untracked` or the new file stays in your working directory when you switch branches.

## When Stashing Goes Wrong

Stash is a temporary bookmark, not a backup. Two failure modes to know:

**The forgotten stash:** You stash something, fix the bug, merge the hotfix, go on vacation, come back two weeks later, and have no idea what is in stash@{0}. To inspect without applying:

```bash
git stash show -p stash@{0}
```

This shows the full diff of that stash. Read it before popping blindly.

**The pop conflict:** You stash changes, make more commits on that branch, then pop the stash. If you committed something that touches the same lines as your stash, you get a conflict — same as a merge conflict. Resolve it the same way: open the file, pick the right version, remove conflict markers, commit.

> **Warning:** If you are going to be away from a piece of work for more than a day, commit it on a work-in-progress branch instead of leaving it in the stash. `git commit -m "WIP: halfway through search feature"` on a dedicated branch is safer than stash@{3} that you have forgotten about.

## Key Takeaways

- `git stash` saves uncommitted work and cleans your directory so you can switch branches
- `git stash pop` restores and removes; `git stash apply` restores and keeps
- The stash is a stack — `git stash list` shows everything saved
- Use `--include-untracked` to stash new files Git has not seen yet
- Stash is for temporary pauses; commit to a WIP branch for anything longer than a day
