# Lab 7: Working with Remote Repositories

## What You're Doing and Why

A remote repository is a centralized or shared copy of a codebase hosted on a Git server accessible across your engineering team. Pushing local commits to a remote makes your work available to collaborators and CI/CD pipelines, while pulling from a remote synchronizes incoming commits from teammates into your local branches.

In this lab, you will interact directly with your team's live Git server (`git-server:3000`), clone a shared project, inspect remote tracking references, and publish your first upstream commit.

---

## Background & Mental Model

- **Remote (`origin`)**: Git identifies remotes by shortnames. By convention, the primary upstream server you clone from is named `origin`.
- **Remote Tracking Branches**: When you clone or fetch, Git creates local read-only snapshots of remote branches, named `origin/<branch>` (or `remotes/origin/<branch>`). These references update only when you execute network commands like `git fetch`, `git pull`, or `git push`.
- **The Publish Workflow**:
  1. Clone or fetch to ensure your local history is aware of the remote.
  2. Author commits locally on your branch.
  3. Push commits to `origin <branch>` to update the remote reference.

---

## Command Reference

### `git clone <url> [directory]`
Clones the remote repository from `<url>`, sets up the `origin` remote automatically, and checks out the default branch into `[directory]`.

### `git remote -v`
Lists all configured remotes along with their fetch and push target URLs.

### `git branch -a` / `git branch -r`
Lists branches. `-r` displays remote-tracking branches; `-a` displays both local and remote branches.

### `git push -u origin <branch>`
Pushes local commits on `<branch>` to the remote named `origin`, and sets up upstream tracking so future pushes on this branch require only `git push`.

---

## Scenario

The engineering team has published a starter project at:
```
http://git-server:3000/student/team-project.git
```

Your objective is to:
1. Clone the repository into your workspace at `~/team-project`.
2. Inspect the remote branches using shell tools to locate the default upstream tracking reference.
3. Register your contribution by authoring a file named `CONTRIBUTORS.md`, committing your change, and pushing it to `origin main`.
