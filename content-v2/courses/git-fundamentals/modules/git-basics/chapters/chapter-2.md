# Chapter 2: Your First Repository

:::
> **Before this chapter:** You should be comfortable in a terminal — `cd`, `mkdir`, creating files with a text editor.
>
> **Hands-On Practice in the Terminal:**
> Your terminal on the right is ready. You will use it to create and initialize your first project directory from scratch, stage files, and push them to the local remote server.

## The Real Reason You Need This

Here is a situation that happens to every developer. You are working on a script. It works. You decide to improve it. An hour later it is broken and you cannot remember what you changed. You have no way to go back.

Or: your teammate emails you "hey I updated the deployment config" and overwrites the change you made this morning. Neither of you knew the other was editing it.

Git solves both problems. It tracks your changes locally on your machine and coordinates collaboration with others through shared repositories.

## Git vs. Remote Platforms (GitHub & GitLab)

In professional software development, you will hear Git, GitHub, and GitLab mentioned together. While related, they serve distinct roles:

- **Git** is the local version control engine installed on your machine. It tracks file history, manages branches, and records snapshots completely offline.
- **GitHub and GitLab** are cloud-based platforms used by developers to store, manage, and collaborate on Git repositories.

Think of Git as your local digital notebook where you track your work, and GitHub or GitLab as the giant online libraries where you publish that notebook so others can read, share, and contribute to it.

While both platforms share the same foundational Git engine, they serve slightly different workflows:

| Feature | GitHub | GitLab |
| :--- | :--- | :--- |
| **Primary Focus** | Community collaboration and open-source hosting | All-in-one DevOps and enterprise development pipeline |
| **CI/CD Automation** | GitHub Actions (modular workflows, extensive Marketplace) | Native built-in CI/CD pipelines out of the box |
| **Review Terminology** | Pull Requests (PRs) | Merge Requests (MRs) |
| **Self-Hosting** | Available on paid enterprise tiers | Robust free self-hosted Community Edition + Enterprise |
| **Common Use** | Open-source libraries, personal projects, developer portfolios | Corporate engineering teams, banks, strict on-prem infrastructure |

## Our Setup in LabOps

In production, developers push code to remotes hosted on GitHub, GitLab, or an enterprise server. Throughout this course, LabOps provides a private, internal Git server provisioned directly inside your lab environment. This allows you to practice authentic remote pushing, pulling, and collaboration without needing third-party cloud accounts or personal access tokens.

Your lab terminal is already initialized with student identity and workflow defaults. You can view these settings anytime from your terminal:

```bash
git config --global --list
```

```text
user.name=Student
user.email=student@labops.local
init.defaultbranch=main
core.editor=nano
color.ui=auto
pull.rebase=false
merge.conflictstyle=diff3
```

## What Happens When You Initialize a Repository

When you run `git init` in a folder, Git creates a hidden `.git` directory. This is the engine room — it stores every commit, every branch, all configuration, and all history.

```bash
mkdir my-project
cd my-project
git init
```

You will see: `Initialized empty Git repository in .../my-project/.git/`

One rule to remember: **if you delete `.git`, you lose all history.** Everything outside `.git` is just your working files — Git does not manage those until you tell it to.

## The Three Areas of a Git Project

This is the most important mental model in Git. Every file you touch exists in one of three places:

```
Working Directory  -->  Staging Area  -->  Repository
   (your edits)        (git add)        (git commit)
```

1. **Working Directory** — The files you see and edit in your folder. Changes here are not tracked by Git until you tell it to.
2. **Staging Area** — The preparation area for your next commit. Staging a file tells Git: *"Include this file's current state in the next snapshot."* Running `git add` puts files here.
3. **Repository** — The permanent snapshots stored inside `.git`. Running `git commit` takes whatever is in the staging area and permanently records it.

Why have a staging area instead of committing directly? Because you don't always want to commit every file you touched. Staging acts like a packing list: you pick the exact changes you want to package into this snapshot, leaving the rest for later.

## Making Your First Commit

Create a file:

```bash
echo "# My Project" > README.md
```

Check what Git sees:

```bash
git status
```

Git reports that `README.md` is "untracked" — Git sees the file in your directory, but it is not queued for the next snapshot.

To tell Git to include it, **stage** it using `git add`:

```bash
git add README.md
```

Staging places the file into the staging area. Check `git status` again to see what changed:

```bash
git status
```

Now `git status` shows `README.md` under **"Changes to be committed."** That is what staging means: the file is selected, queued up, and waiting to be committed.

Commit it:

```bash
git commit -m "Add README with project description"
```

You just created your first permanent snapshot. Even if you delete the file right now, Git can recover it.

## Writing Commit Messages That Help You Later

A commit message answers one question: **what changed, and why?**

Bad messages (you will regret these in six months):
- `update`
- `fix stuff`
- `WIP`
- `changes`

Good messages:
- `Add README with project description`
- `Fix login redirect loop when session expires`
- `Remove deprecated search endpoint — no longer called after auth refactor`

> **Why this matters in a real job:** When something breaks in production at 2am, the first thing you do is `git log` to see what changed recently. A log full of `fix stuff` and `update` is useless. A log full of precise messages tells you exactly where to look.

## Seeing Your History

```bash
git log
```

Shows every commit: SHA hash, author, date, message.

```bash
git log --oneline
```

Compact view — one line per commit. This is what you will use most day-to-day.

## Backing Up to the Remote (Pushing to Origin)

Right now, your commits exist only inside your local `.git` directory. If your machine fails or you want teammates to inspect your work, you need to push it to a remote server.

### 1. Set the Remote Origin

In Git, a remote server URL is given a shorthand alias. By convention, the primary remote repository is always named **`origin`**.

Connect your repository to the project repository on the server:

```bash
git remote add origin http://git-server:3000/student/my-project.git
```

Verify that the remote is registered:

```bash
git remote -v
```

```text
origin  http://git-server:3000/student/my-project.git (fetch)
origin  http://git-server:3000/student/my-project.git (push)
```

### 2. Push Your Commits

Push your local `main` branch to the remote server:

```bash
git push -u origin main
```

```text
To http://git-server:3000/student/my-project.git
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

The `-u` flag (short for `--set-upstream`) links your local `main` branch to `origin/main` on the server. Because this upstream tracking is established, you only need to run:

```bash
git push
```

for any future commits.

## The Recovery Scenario (Why Commits Matter)

Let us put it together. You have your commits saved. You edit `README.md` and accidentally delete an important line.

```bash
# See what changed since last commit
git diff

# Discard the accidental change, restore from last commit
git restore README.md
```

`README.md` is back to exactly how it was in your last commit. This works because Git has that snapshot.

This is the core value of Git: every commit is a restore point. The discipline of committing regularly — with clear messages — is what makes recovery fast when things go wrong.

> **Try This:** Create a file, commit it. Then deliberately break it (delete a line, add garbage). Run `git diff` to see the damage. Run `git restore <filename>` to undo it. Run `git log --oneline` to see your restore point is still there.

## Key Takeaways

- Git tracks history locally on your machine; GitHub and GitLab are web platforms used to store and collaborate on remote repositories
- LabOps provides an internal Git server so you can practice real remote workflows without external accounts
- `git init` creates `.git` to store repository history
- Files move through three areas: working directory → staging area (`git add`) → repository (`git commit`)
- `git remote add origin <url>` connects your local repository to a remote server
- `git push -u origin main` uploads your commits and establishes upstream tracking
- Every commit is a restore point — `git restore <file>` recovers lost work
