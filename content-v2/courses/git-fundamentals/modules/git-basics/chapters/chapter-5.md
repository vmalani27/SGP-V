# Chapter 5: Keeping Unwanted Files Out

:::terminal-demo
id: git-unwanted-files
image: labops-git-fundamentals:latest
:::

> **Before this chapter:** You should be comfortable with `git add`, `git commit`, and `git status` from Chapter 3.

## The Problem

You initialize a repository. You create a `.env` file with your database password. You run `git add .` and commit. The password is now in your Git history — permanently. Deleting the file from the working directory does not remove it from history. Pushing to GitHub makes it publicly readable within seconds of the push.

`.gitignore` is how you prevent a file from ever being tracked. It does not fix the problem after the fact — it prevents it.

## Creating a `.gitignore`

Create a file named `.gitignore` in your project root:

```
# Secrets
.env
.env.*
*.key
*.pem

# Dependencies — can be reinstalled, should not be in version control
node_modules/
__pycache__/
.venv/
venv/

# Build outputs
dist/
build/
*.pyc

# OS and editor files
.DS_Store
Thumbs.db
.idea/
*.swp
```

Once `.gitignore` exists, Git will stop showing those files as untracked. They will not appear in `git status` and cannot be accidentally staged with `git add .`.

## Three File States Worth Knowing

- **Untracked** — Git sees the file but has never been told to track it
- **Ignored** — Git actively skips the file because it matches a `.gitignore` pattern
- **Tracked** — Git is watching the file and will record any change to it

```bash
git status
```

Untracked files appear under "Untracked files." Ignored files do not appear at all — `git status` skips them silently. To see what is being ignored:

```bash
git status --ignored
```

## Pattern Syntax

| Pattern | What it matches |
|---|---|
| `.env` | A file named exactly `.env` |
| `.env.*` | `.env.local`, `.env.staging`, etc. |
| `*.pyc` | Any file ending in `.pyc` |
| `node_modules/` | The `node_modules` directory and everything inside |
| `dist/` | The `dist` directory and everything inside |
| `!important.log` | Exception — track this file even though `*.log` is ignored |

## When a File Is Already Tracked

`.gitignore` only prevents Git from starting to track a file. If the file is already in the repository, adding it to `.gitignore` does nothing — Git will keep tracking it.

To stop tracking a file that was already committed:

```bash
git rm --cached .env
git commit -m "Remove .env from tracking"
```

`git rm --cached` removes the file from Git's index (stops tracking) but leaves it on your disk. After this commit, future changes to `.env` will be invisible to Git — as long as `.gitignore` contains the pattern.

> [!WARNING]
> Even after `git rm --cached`, the file still exists in the commit history. Anyone who clones the repository and checks out an earlier commit will see it. If the file contained a real secret, rotate the credential immediately. History rewriting with `git filter-repo` can remove it from all commits, but that requires coordination with every team member who has cloned the repository.

## What to Always Ignore

Every project should ignore these from day one:

**Secrets:** `.env`, `*.key`, `*.pem`, `credentials.json` — anything containing passwords, API keys, tokens, or certificates.

**Dependencies:** `node_modules/`, `__pycache__/`, `.venv/`, `vendor/` — anything that can be reinstalled from a lockfile. Committing dependencies bloats the repository and causes constant merge conflicts.

**Build outputs:** `dist/`, `build/`, `*.pyc`, `*.class` — generated files that can be recreated from source.

**Local config:** `.idea/`, `.vscode/`, `.DS_Store`, `Thumbs.db` — editor and OS files that are meaningless to other developers.

## Starting Right

GitHub maintains a repository of `.gitignore` templates for every major language and framework at [github.com/github/gitignore](https://github.com/github/gitignore). Copy the relevant template when you initialize the repository — before your first commit.

Add `.gitignore` when you `git init`. Not after you realize you committed something you should not have.

## Key Takeaways

- `.gitignore` prevents files from being tracked — it does not fix files already in history
- Three states: untracked (Git sees it), ignored (Git skips it), tracked (Git watches it)
- `git status --ignored` shows what is being silently ignored
- `git rm --cached <file>` stops tracking an already-committed file without deleting it from disk
- If a secret was committed and pushed, rotate the credential first — history cleanup comes second
