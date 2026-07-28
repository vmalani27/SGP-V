# Chapter 3: Controlling What Gets Saved

## In this chapter, you will

- Use selective staging to create precise commits
- Understand what `git status` is telling you
- Set up `.gitignore` to keep junk out of your history

## Why Staging Exists

Imagine you are working on a project. You fix a bug in `auth.js` and also tweak the button color in `styles.css`. These are two unrelated changes.

Without staging, you would have to commit both changes together. Your commit message would be something like "fix button and auth bug", which is confusing for anyone reading the history later.

Staging lets you choose exactly what goes into each commit. You can stage `auth.js`, commit it with the message "Fix login redirect bug", then stage `styles.css` and commit it with "Update button hover color". Clean, focused history.

This is not an extra step to slow you down. It is a precision tool that makes your history useful.

## Selective Staging in Practice

Start with a file that has multiple changes:

```
git status
```

Git shows you which files are modified but not staged. To stage specific files:

```
git add auth.js
```

To stage only part of a file (interactive staging):

```
git add -p
```

Git will walk you through each changed chunk and ask whether you want to stage it. Press `y` to stage, `n` to skip, `s` to split the chunk further.

> **Tip:** Interactive staging (`git add -p`) is one of the most useful Git skills. It lets you create atomic commits from a single file that has multiple unrelated changes.

## What `git status` Is Really Telling You

`git status` is your dashboard. It shows you:

- **Untracked files** — new files Git does not know about yet
- **Changes not staged for commit** — modified files that are not in the staging area
- **Changes to be committed** — files in the staging area, ready to commit

The workflow:

1. Edit files (they become "modified")
2. Run `git status` to see what changed
3. Run `git add` on the files you want to commit
4. Run `git status` again to confirm what is staged
5. Run `git commit`

Check `git status` before *and* after every operation. It will save you from confusion.

## Ignoring Files You Never Want to Track

Some files should never be committed: compiled binaries, `node_modules/`, `.env` files with secrets, OS junk like `.DS_Store`.

Create a `.gitignore` file in your project root:

```
node_modules/
.env
*.log
.DS_Store
```

Git will completely ignore files and folders matching these patterns. They will not show up in `git status` and will never be committed.

> **Warning:** If you already committed a file and *then* added it to `.gitignore`, Git will keep tracking it. You need to remove it from tracking first with `git rm --cached <file>`. The `.gitignore` only prevents Git from *starting* to track new files.

> **Try This:** Create a `.env` file with some fake secrets in your project. Verify that `git status` does not list it. Then create a `temp.log` file and verify that `*.log` in your `.gitignore` hides it too.

## The Full Picture

Here is how the three areas connect with the commands you now know:

```
Edit files --> git add --> git commit
(working)    (staging)   (repository)

git status   shows you what is in each area
.gitignore   tells Git what to skip entirely
```

## Key Takeaways

- Staging lets you choose which changes go into each commit
- Use `git add -p` to stage parts of a file for atomic commits
- `git status` is your most important command — check it before and after every operation
- `.gitignore` prevents files from being tracked; use `git rm --cached` to stop tracking files that were already committed
