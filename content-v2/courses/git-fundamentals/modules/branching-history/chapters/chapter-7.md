# Chapter 7: Working in Parallel

:::terminal-demo
id: git-branches
image: labops-git-fundamentals:latest
:::

> **Prerequisites:** You should be comfortable with commits and `git log` from the previous chapters. You should understand that a commit is a saved snapshot. Branches build directly on that idea.

## The Situation This Solves

You join a team. There is a shared GitHub repository. You need to add a new feature — let's say a user search page. Your teammate is fixing a bug in the login flow at the same time.

If you both commit directly to `main`, your half-finished search page and their half-finished bug fix are constantly mixing together. Every time you pull, you get their broken work. Every time they pull, they get yours. Nothing is stable.

The solution every real team uses: **each person works on their own branch**. Your feature lives in `feature/user-search`. Their fix lives in `fix/login-redirect`. Main stays stable. When each piece is ready and reviewed, it gets merged in through a Pull Request.

This is the feature-branch workflow, and it is how virtually every software team on the planet works.

## What a Branch Actually Is

A branch is a lightweight pointer to a commit — not a copy of the project.

When you create a branch, Git creates a new pointer at your current commit. As you make commits, your branch's pointer moves forward. Other branches stay where they were.

```
main:       A --- B --- C
                   \
feature:            D --- E
```

Commits A, B, and C are shared history. Your feature branch forked from B and added D and E. `main` does not know about D and E yet. This is exactly right — you are not changing shared ground until you deliberately merge.

## Creating and Switching Branches

Create a branch and switch to it in one step:

```bash
git switch -c feature/user-search
```

You are now on `feature/user-search`. Any commits you make here only move this branch's pointer.

Switch back to main:

```bash
git switch main
```

Your working directory changes to match `main`'s state. Files your feature branch added may disappear from view — they are not gone, they are on that branch.

List all branches (the current one has `*`):

```bash
git branch
```

> **Tip:** Use descriptive names: `feature/user-search`, `fix/login-redirect`, `chore/upgrade-deps`. Avoid `my-branch`, `test`, or `new`. Names like `feature/user-search` tell your teammates what is happening without asking.

## Making Commits on a Branch

Commits on a branch only move that branch's pointer:

```bash
git switch -c feature/user-search
# edit some files
git add .
git commit -m "Add search page skeleton"
# edit more files
git commit -m "Wire search results to API endpoint"
```

Now switch back:

```bash
git switch main
git log --oneline
```

Your two feature commits are not visible here — they live on the feature branch. `main` is untouched.

## When Branches Come Back Together: Merge Conflicts

This is the part most tutorials skip. When two people edit the same part of the same file on different branches and then try to merge, Git cannot decide which version to keep. That is a merge conflict.

```
<<<<<<< HEAD (your branch)
return user.search(query)
=======
return user.find_by_name(query)
>>>>>>> main
```

Git is telling you: these two lines contradict each other. A human has to decide which one is correct (or write a third version that combines both).

Conflicts are not failures — they are Git correctly refusing to guess. The fix is: open the file, pick the right version, delete the conflict markers, and commit.

> **In a real team:** this is why short-lived branches matter. A branch that lives for a week and touches 3 files is easy to merge. A branch that lives for a month and touches 40 files is a conflict nightmare. Merge often, branch small.

## The Pull Request Connection

Branches do not just exist locally. The standard team workflow:

1. You create a branch, make commits, push the branch to GitHub: `git push origin feature/user-search`
2. You open a Pull Request — a request to merge your branch into `main`
3. A teammate reviews the code in the PR on GitHub
4. CI runs automated tests on your branch
5. If approved and green, the branch is merged into `main` and deleted

**This is the branch workflow in the real world.** Every commit you make on `feature/user-search` feeds this pipeline. The branch is not just for keeping `main` clean — it is the unit of review and the trigger for CI.

> **Try This:** Create a branch called `feature/my-test`, make a commit on it, then switch back to `main`. Run `git log --oneline --all` — you will see both branches' commits labelled. Now imagine that `feature/my-test` is your colleague's branch and `main` is the shared stable line. That's the real picture.

## Cleaning Up

Delete a merged branch:

```bash
git branch -d feature/user-search
```

Git only allows this if the branch was merged. To force-delete unmerged work:

```bash
git branch -D feature/user-search
```

> **Warning:** `-D` deletes unmerged commits. They are not immediately gone (the reflog keeps them briefly), but treat it as permanent. Only use it when you are sure you do not need the work.

## Key Takeaways

- A branch is a lightweight pointer to a commit — not a copy of the codebase
- The feature-branch workflow keeps `main` stable while you work independently
- Merge conflicts happen when two branches edit the same lines — they are normal and fixable
- `git push origin <branch>` + Pull Request is how individual branch work becomes team work
- Short-lived, focused branches are easier to merge and review than long-running ones
