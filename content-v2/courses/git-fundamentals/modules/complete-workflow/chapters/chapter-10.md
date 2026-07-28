# Chapter 10: Your Daily Git Routine

## In this chapter, you will

- See how all the concepts connect in a real workflow
- Follow a step-by-step feature branch process
- Build habits that keep your history clean and your team productive

## What You Have Learned So Far

You now know how to:

- Initialize a repository and make commits
- Stage changes selectively and ignore files
- Undo mistakes at every level
- Create branches to work in parallel
- Merge branches and resolve conflicts
- Push and pull from remote repositories
- Stash work when you need to pause
- Search history to find what changed

This chapter puts it all together into the workflow that professional teams use every day. This is not theory — this is exactly what you will do on a real project.

## A Day in the Life of a Git User

Here is a realistic sequence of what a developer does in a single work session.

### Step 1: Start From an Up-to-Date Main Branch

```
git switch main
git pull origin main
```

Never start new work on a stale `main`. Always pull first. This takes two seconds and saves you from merge conflicts later.

### Step 2: Create a Feature Branch

```
git switch -c feature/add-search-filter
```

Every piece of work gets its own branch. Bug fixes, features, experiments — everything. `main` stays clean and deployable at all times.

### Step 3: Work and Commit Frequently

Edit files. Check `git status`. Stage. Commit.

```
git add src/search/
git commit -m "Add search input component with debounce"

git add src/api/
git commit -m "Connect search input to API endpoint"

git add tests/
git commit -m "Add integration tests for search filter"
```

Notice the pattern: small, focused commits. Each one is a complete thought. If your code review is interrupted, the reviewer can understand your work commit by commit.

### Step 4: Push Your Branch Early and Often

```
git push origin feature/add-search-filter
```

Pushing early means your work is backed up on the remote. If your laptop dies, your work is safe. It also lets your team see your progress.

### Step 5: Keep Your Branch Updated

While you work, others are merging into `main`. Keep your branch current:

```
git switch main
git pull origin main
git switch feature/add-search-filter
git merge main
```

Doing this regularly keeps conflicts small and manageable. If you wait until the end of the week, you might have a massive conflict to resolve.

### Step 6: Open a Pull Request

When your feature is complete and tested, push the final version and open a pull request on GitHub/GitLab. Your team reviews the code, leaves comments, and requests changes if needed.

### Step 7: Clean Up After Merging

After the pull request is merged:

```
git switch main
git pull origin main
git branch -d feature/add-search-filter
git push origin --delete feature/add-search-filter
```

Delete the branch locally and remotely. It is done. Move on to the next task.

## Writing Good Commit Messages

Follow this structure:

```
Short summary (50 chars or less)

Optional longer explanation of what and why.
Wrap at 72 characters. Use complete sentences.

Bullet points are fine for listing multiple changes:
- Added search input component
- Connected to /api/search endpoint
- Wrote integration tests
```

The summary should complete the sentence: "This commit will ___". Examples:

- "This commit will add password strength validation"
- "This commit will fix the login redirect loop"
- "This commit will remove the deprecated analytics endpoint"

> **Warning:** Do not write messages like `fix`, `update`, `WIP`, or `stuff`. When you are debugging a production issue at 2 AM and `git log` shows `fix` as the last 5 commits, you will regret it. Spend 10 extra seconds writing a real message.

## The Rules That Matter

If you remember nothing else, remember these:

1. **Always start from an up-to-date `main`**
2. **Every piece of work gets its own branch**
3. **Commit early and often with clear messages**
4. **Pull before you push**
5. **Delete merged branches**

These five rules will keep you out of trouble in 99% of situations.

> **Try This:** Follow the full workflow end-to-end. Create a repository on GitHub, clone it, create a feature branch, make 3 commits, push the branch, merge it into `main` locally, then clean up. Do this three times and it will become muscle memory.

## Key Takeaways

- The feature branch workflow: create branch, work, commit, push, merge, clean up
- Always start from an up-to-date `main` and keep your branch synced
- Write commit messages that explain what changed and why
- Push early for backup; merge often to keep conflicts small
- Delete branches after merging to keep the repository clean
