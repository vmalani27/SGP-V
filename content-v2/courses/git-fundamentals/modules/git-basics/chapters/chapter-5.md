# Chapter 5: Keeping Unwanted Files Out

> **Before this chapter:** You should be comfortable with `git add`, `git commit`, and `git status` from Chapter 3.

## The Problem

A project directory contains more than source code. Local configuration, generated files, downloaded dependencies, editor settings, operating-system metadata, and credentials may all exist beside the files you intend to commit.

Git does not know which files you consider temporary, generated, or private. If an untracked file is not ignored, Git reports it and a broad command such as `git add .` can stage it.

`.gitignore` tells Git which untracked files to leave out of normal status and staging operations.

## Discover the Difference

The terminal includes a pre-configured repository in `~/practice`. Start by checking its status, then create a harmless local environment file:

```bash
cd ~/practice
git status
touch .env
git status
```

Git reports `.env` as **untracked**. The file exists on disk, but it has not been added to the repository.

Now create a `.gitignore` file with just one line inside it:

```text
.env
```

Run the status commands again:

```bash
git status
git status --ignored
```

The file is still on disk, but it no longer appears as an ordinary untracked file. Git now treats it as **ignored**. `git status --ignored` shows it when you explicitly ask for ignored files.

Stage the repository and inspect the staged snapshot:

```bash
git add .
git status
git diff --staged
```

Only `.gitignore` should be staged. The ignore rule does not delete `.env`; it keeps the local file out of normal staging.

Git has 3 states it assigns files inside a working repository

| State | Meaning |
|---|---|
| **Untracked** | The file exists, but Git has not recorded it. |
| **Ignored** | The file is untracked and a rule excludes it from normal status and staging. |

## Ignore Patterns

`.gitignore` contains patterns, or list of files to ignore, its upto you to write down lists of files or simply define patterns

| Pattern | Matches | Example |
|---|---|---|
| `.env` | A file named exactly `.env` | `.env` |
| `.env.*` | Local environment variants | `.env.local`, `.env.test` |
| `*.pyc` | Any file ending in `.pyc` | `app.pyc`, `server.pyc` |
| `__pycache__/` | The directory and everything inside it | `__pycache__/app.pyc` |
| `node_modules/` | A dependency directory | `node_modules/express/` |

One pattern can cover files that do not exist yet. A rule such as `*.pyc` ignores future Python bytecode files automatically.

What belongs in `.gitignore` depends on the project, but a useful rule is: ignore files that are generated, machine-specific, local-only, or secret when they are not part of the project's history.

Common examples include `.env`, `.env.*`, `node_modules/`, `__pycache__/`, `.venv/`, `dist/`, `build/`, `.DS_Store`, and `Thumbs.db`.

## Commit the Rule

Unlike the files it excludes, `.gitignore` is normally part of the repository. Commit it so teammates and CI use the same rules:

```bash
git add .gitignore
git commit -m "Add Git ignore rules"
git push
```

The easiest time to create the file is before the first commit. 

## Key Takeaways

- Git reports untracked files unless an ignore rule excludes them.
- `.gitignore` uses patterns to keep local, generated, and secret files out of normal staging.
- `git status --ignored` shows files that ordinary status hides.
- `.gitignore` itself should normally be committed and shared.