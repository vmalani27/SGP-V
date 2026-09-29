# Chapter 1: Why Version Control Exists

> **No prior Git knowledge required.** 
> You must be comfortable in a terminal — `ls`, `cd`, `mkdir`.

## The Situation

It is your second week as a DevOps intern. You are asked to update a deployment script on the production CI server. You make the change, test it locally, and push it. An hour later, builds start failing. Someone else on the team had changed the same file yesterday. Your push overwrote theirs. Nobody knows what the file looked like before.

Git is the system that prevents this — and recovers from it when it happens anyway. Lets understand how it works

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

A commit is a pointer to a **tree object**, and that tree represents the exact state of every file at that point.

```bash
git log --oneline
```

```
a81f2c1 Add login
b72e991 Add database config
c31a442 Initial commit
```

Inspect what the commit `a81f2c1` actually points to:

```bash
git ls-tree a81f2c1
```

```
100644 blob 8b137891...    README.md
040000 tree 4a7d1ed2...    src
100644 blob 91e8c3aa...    package.json
```

- `blob` — file contents
- `tree` — directory
- the SHA — the object's unique identity (its content hash)
- `100644` — the file mode

Go deeper into a subdirectory:

```bash
git ls-tree a81f2c1 src
```

Or read the actual file as it existed at that commit:

```bash
git show a81f2c1:src/main.py
```

The full structure:

```
COMMIT
  │
  ▼
TREE  ← snapshot of the repository root
  ├── blob → README.md contents
  ├── tree → src/
  │            ├── blob → main.py contents
  │            └── blob → utils.py contents
  └── blob → package.json contents
```

Inspect the raw commit object:

```bash
git cat-file -p a81f2c1
```

```
tree 7a3f...
parent b72e...
author Jane Smith <jane@example.com> 1700000000 +0000
committer Jane Smith <jane@example.com> 1700000000 +0000

Add login
```

Then inspect the tree it points to:

```bash
git cat-file -p 7a3f...
```

Git stores all of these objects — commits, trees, blobs — in `.git/objects/`, addressed by their SHA. If `README.md` has not changed across 20 commits, all 20 commits point to the same blob. Git does not duplicate the file — it reuses the identical object.

This is what "Git stores snapshots" actually means: each commit describes a complete filesystem state through its tree, while Git internally deduplicates anything that has not changed.

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
