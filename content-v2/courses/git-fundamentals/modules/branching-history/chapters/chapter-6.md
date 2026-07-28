# Chapter 6: Bringing Work Together

## In this chapter, you will

- Merge a feature branch back into `main`
- Understand fast-forward vs. three-way merges
- Resolve merge conflicts with confidence

## Why Merging Exists

You built a feature on a branch. It is tested and ready. Now you need to integrate it back into `main` so the rest of the team can use it. That is what merging does — it combines the histories of two branches.

## How Git Decides What to Do

When you run `git merge feature/search`, Git looks at three points:

1. **The merge base** — the last commit that both branches share
2. **Your current branch tip** — where you are now (e.g., `main`)
3. **The branch you are merging in** — where `feature/search` is

Git then figures out what changed on each side since they diverged and tries to combine them.

## Fast-Forward Merges

If the branch you are merging has not diverged — meaning `main` has no new commits since the branch was created — Git does a **fast-forward**. It simply moves the `main` pointer forward to the feature branch's commit.

```
Before:  main: A --- B
                    \
feature:            C --- D

After:   main: A --- B --- C --- D
                               (HEAD -> main)
```

No merge commit is created. The history looks linear. This is the cleanest outcome.

## Three-Way Merges

If both branches have new commits since they diverged, Git creates a **merge commit** — a special commit with two parents that ties the two histories together.

```
Before:  main: A --- B --- E
                    \
feature:            C --- D

After:   main: A --- B --- E --- M  (merge commit)
                    \           /
feature:            C --- D ---
```

The merge commit `M` records that it combined `E` and `D`. Your history now shows exactly when and how the feature was integrated.

## Merge Conflicts

A conflict happens when both branches changed the same lines in the same file. Git cannot figure out which version is correct, so it pauses and asks you to decide.

When this happens, Git marks the conflicted file with conflict markers:

```
<<<<<<< HEAD
This is what is on your current branch
=======
This is what is on the branch you are merging in
>>>>>>> feature/search
```

Your job is to:

1. Open the file and find the conflict markers
2. Decide which version to keep (or combine them)
3. Remove the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
4. Stage the resolved file: `git add <file>`
5. Commit: `git commit`

> **Tip:** Most merge conflicts are simple. Usually one person changed a line and the other person changed the same line. Read both versions, pick the right one, and move on. Do not overthink it.

## The Merge Workflow

```
git switch main
git merge feature/search
# If conflicts: resolve them, git add, git commit
git branch -d feature/search
```

That is it. You merged, resolved if needed, and cleaned up the branch.

> **Warning:** Do not panic when you see a conflict. It does not mean something is broken. It means Git needs your input to resolve an ambiguity. Take a breath, read the file, and make a decision.

> **Try This:** Create a branch, change a line in a file, commit it. Switch back to `main`, change the *same* line differently, commit it. Now merge the branch. Git will show you a conflict. Resolve it by choosing one version, then complete the merge.

## Key Takeaways

- Merging combines two branches' histories into one
- Fast-forward merges are simple pointer moves; three-way merges create merge commits
- Conflicts happen when both branches change the same lines
- Resolve conflicts by editing the file, removing markers, staging, and committing
