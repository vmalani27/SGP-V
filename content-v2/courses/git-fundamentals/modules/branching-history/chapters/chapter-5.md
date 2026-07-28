# Chapter 5: Working in Parallel

## In this chapter, you will

- Understand what branches actually are
- Create, switch between, and delete branches
- See how branches let you work without affecting anyone else

## The Problem With One Branch

Imagine you and a teammate are both working on the same project. You need to add a search feature. Your teammate needs to fix a bug in the login page. If you both work on `main`, you will constantly step on each other's changes. Every time one of you commits, the other has to deal with it.

Branches solve this. A branch is an independent line of development. You can work on your feature in your branch while your teammate works in theirs. Neither of you affects the other until you are both ready to combine your work.

## What a Branch Actually Is

A branch is a lightweight, movable pointer to a specific commit. That is it. It is not a copy of the project. It is not a snapshot. It is a pointer.

When you create a branch, Git creates a new pointer at your current commit. Both branches share the same history up to that point. As you make commits on one branch, that branch's pointer moves forward. The other branch's pointer stays where it was.

```
main:       A --- B --- C
                   \
feature:            D --- E
```

Commits A, B, and C are shared. Your feature branch forked from B and added D and E. The `main` branch does not know about D and E yet.

## Creating and Switching Branches

To create a new branch:

```
git branch feature/search
```

This creates the branch but does not switch to it. To create and switch in one step:

```
git switch -c feature/search
```

To switch between branches:

```
git switch main
git switch feature/search
```

When you switch branches, your working directory changes to match the state of that branch. Files may appear, disappear, or change content. This is normal — Git is swapping out your working directory to match the branch you are on.

> **Tip:** Use descriptive branch names that explain what you are working on. `feature/search`, `fix/login-redirect`, `chore/update-deps` are all better than `my-branch` or `test`.

## What Happens When You Commit on a Branch

When you make a commit on a branch, only that branch's pointer moves forward. The other branch stays where it was.

```
Before:  main: A --- B
                    (HEAD -> main)

After:   main: A --- B --- C
                         (HEAD -> main)
```

Now if you switch to `feature/search` and make a commit there:

```
main:       A --- B --- C
                   \
feature:            D
```

The two branches diverge. This is exactly what you want — independent lines of development.

## Listing and Deleting Branches

To list all branches:

```
git branch
```

The current branch is marked with `*`.

To delete a branch you are done with:

```
git branch -d feature/search
```

Git will only delete it if the branch has been fully merged. To force-delete a branch with unmerged work:

```
git branch -D feature/search
```

> **Warning:** Be careful with `git branch -D`. You are deleting work that has not been merged. Git will not recover it (though the reflog might, for a limited time).

> **Try This:** Create a branch called `test-branch`, switch to it, make a commit, then switch back to `main`. Run `git log --oneline --all` to see both branches' commits. Notice how your new commit only appears on `test-branch`. Delete the branch with `git branch -d test-branch`.

## Key Takeaways

- A branch is a lightweight pointer to a commit, not a copy of the project
- Branches let you work independently without affecting `main`
- Use `git switch -c <name>` to create and switch to a new branch
- Delete merged branches to keep your repository clean
