# Chapter 1: Why Version Control Exists

## The Situation

It is your second week as a DevOps intern. You are asked to update a deployment script on the production CI server. You make the change, test it locally, and push it. An hour later, builds start failing. Someone else on the team had changed the same file yesterday. Your push overwrote theirs. Nobody knows what the file looked like before.

Git is the system that prevents this — and recovers from it when it happens anyway. Throughout this chapter, you can follow along directly using the pre-configured practice repository in the `~/practice` folder in your terminal. Let's understand how it works.

## What Git Records

Every time you save your work in Git (called a "commit"), Git records a complete snapshot of every file in your project at that moment. The snapshot is stamped with who made it, when, and why.

```
Snapshot A      Snapshot B      Snapshot C      Snapshot D
(Monday)   ──►  (Tuesday)  ──►  (Wednesday) ──►  (Thursday)
"Add deploy     "Fix broken     "Add timeout    "Merge
 script"         DNS lookup"     to retry"       teammate's fix"
```

You can go back to any snapshot at any time. You can see exactly what changed between two snapshots. You can find out who changed a line and when.

## How Git Stores a Snapshot

Because we are working directly in a command-line environment without a graphical Git client (GUI), the terminal is our direct window into Git's internal object database.

Your interactive terminal on the right is pre-loaded with a repository in `/home/student/practice`. Enter the folder and inspect its commit history:

```bash
cd ~/practice
git log --oneline
```

You will see the initial commit record:

```
cdd96d4 Initial application release
```

A commit in Git is not an incremental diff of individual lines — it is a direct pointer to a **tree object**, representing the exact state of all project files at that point in time.

Inspect what the commit actually points to using low-level Git plumbing tools:

```bash
git cat-file -p HEAD
```

```
tree 1107d109bb1dd1cbe33763e3f3ed57577d3d16df
author Student <student@labops.local> 1790713119 +0000
committer Student <student@labops.local> 1790713119 +0000

Initial application release
```

Notice the `tree` hash. Let's inspect the files recorded inside that tree snapshot:

```bash
git ls-tree HEAD
```

```
100644 blob b22fe41e...    README.md
100644 blob 2aca867a...    api.py
100644 blob 6213a005...    auth.py
100644 blob c6fd1f09...    styles.css
```

Git categorizes its internal objects cleanly:
- `blob` — file contents (your source code, configs, or documentation)
- `tree` — a directory snapshot mapping filenames to blob SHAs
- `commit` — a top-level record linking a tree snapshot to an author, timestamp, and log message
- `100644` — standard POSIX file permissions (regular readable/writable file)

You can read the exact file contents preserved in that snapshot directly from the Git object database:

```bash
git show HEAD:auth.py
```

The underlying graph structure looks like this:

```
COMMIT  (cdd96d4: "Initial application release")
  │
  ▼
TREE    (1107d10: root directory snapshot)
  ├── blob → README.md contents
  ├── blob → api.py contents
  ├── blob → auth.py contents
  └── blob → styles.css contents
```

Git stores all of these objects — commits, trees, and blobs — in `.git/objects/`, indexed by their SHA content hashes. If `README.md` remains unchanged across 20 consecutive commits, all 20 commits reference the exact same blob SHA. Git never duplicates unchanged files — it reuses the identical object in storage.

Now run `git status` inside `~/practice`:

```bash
git status
```

```
Changes not staged for commit:
  modified:   api.py
  modified:   auth.py
  modified:   styles.css
```

Notice that Git tells you files have been modified in your working directory compared to the committed snapshot. These modifications represent work in progress — changes that exist on your disk but are not yet recorded in Git's snapshot history. You will learn how to turn these working changes into clean, atomic commits in Chapters 2 and 3.

## Distributed: Every Clone Has the Full History

When you clone a repository, you get the complete history on your own machine — every commit, every branch, everything.

Three things follow from this:

1. **You can work offline.** Commits, branches, and history searches all run locally. No network required.
2. **Speed.** `git log`, `git diff`, `git blame` — all read from local disk, instant.
3. **No single point of failure.** If the central server goes down, every team member's machine still has the complete history.

## Setting Up Your Identity

Before your first commit, tell Git who you are. Every commit is permanently stamped with this:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@yourcompany.com"
```

The `--global` flag writes to `~/.gitconfig` — applies to every repository on this machine.

Verify it:

```bash
git config --list
```

> [!TIP]
> Use the same email you use for GitHub or GitLab. This links your commits to your profile so reviewers know who made each change.

## How Professionals Use Git Every Day

**Infrastructure as Code.** Every Terraform file, Kubernetes manifest, Helm chart, and Ansible playbook lives in a Git repository. Infrastructure changes go through the same workflow as code changes: branch → commit → pull request → review → merge. Your production infrastructure has an audit trail — you can see who changed a security group rule three months ago and exactly what they changed it to.

**CI/CD pipeline triggers.** GitHub Actions, GitLab CI, Jenkins — they all watch Git events. A push to `main` runs your test suite and deploys to production. A push to a feature branch runs tests only. An opened pull request triggers a security scan. The automation layer is driven entirely by Git events.

**Incident response.** Production is broken. The on-call engineer runs `git log --oneline` to see what changed in the last few hours, then `git show <sha>` to read the exact diff of the suspicious commit. If that commit caused the incident, `git revert <sha>` undoes it in seconds and the pipeline redeploys automatically.

**Code review.** No change reaches `main` without a pull request reviewed by at least one other engineer. The entire review workflow is built on Git branches — a PR is a request to merge one branch into another, with a comment thread attached.

## Key Takeaways

- Every commit is a pointer to a tree — a complete snapshot of the repository at that moment
- Commits, trees, and blobs are stored as content-addressed objects in `.git/objects/` — unchanged files are deduplicated across commits
- Use `git ls-tree <sha>` to inspect a snapshot and `git cat-file -p <sha>` to read any object
- Every clone has the full history — work offline, recover from server failures
- Configure `user.name` and `user.email` before your first commit — they are embedded in every commit permanently
- Git is the foundation of CI/CD, infrastructure management, incident response, and code review
