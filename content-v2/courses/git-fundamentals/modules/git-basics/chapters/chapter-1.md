# Chapter 1: Why Version Control Exists

## In this chapter, you will

- Understand why version control replaced manual backups and unversioned file chaos
- Master the mental model of Git: distributed architecture and commit snapshots
- Verify your local Git installation using `git --version`
- Configure your global commit authorship (`user.name` and `user.email`)
- Inspect and audit active configuration settings with `git config --list`

---

## The "Final_Version_v2" Problem

You are working on a project. Everything is going well until you realize the version from yesterday was better than what you have now. You saved over the file. There is no undo.

Or maybe you and a teammate both edited the same file. Neither of you can remember who changed what. One of your changes gets lost.

This is how software was managed before version control. Files were copied into folders like `project_v2`, `project_final`, `project_final_real`. It was messy, error-prone, and impossible to collaborate on.

Version control solves this by tracking every change you make to your project over time. You can go back to any point in your project's history, see who changed what, and work with other people without stepping on each other's toes.

---

## What Git Actually Does

Git is a **distributed version control system**. That sentence has two important words:

**Version control** means Git tracks changes to files over time. Every time you tell Git to save a snapshot, it records what changed, who changed it, and when. You can recall any snapshot later.

**Distributed** means every developer has a complete, independent copy of the entire project history on their own local machine. There is no single point of failure. You can commit, view logs, and branch completely offline without needing a connection to a central server.

Here is the mental model. Think of Git as a series of snapshots of your project:

```text
Snapshot A  ──►  Snapshot B  ──►  Snapshot C  ──►  Snapshot D
(yesterday)     (you fixed       (you added        (teammate
                 a bug)           a feature)        merged)
```

Each snapshot is called a **commit**. You can move between them, compare them, or even combine them.

---

## Installing & Verifying Git

Open your terminal and verify whether Git is already installed:

```bash
git --version
```

If you see an output like `git version 2.43.0`, you are ready to proceed. If not:

- **Linux**: Run `sudo apt install git` (Debian/Ubuntu) or `sudo dnf install git` (Fedora)
- **macOS**: Run `brew install git` or install Xcode Command Line Tools
- **Windows**: Download from [git-scm.com](https://git-scm.com/download/win)

---

## Configuring Your Identity

Every commit you create in Git is permanently stamped with an author name and email address. Before you create your first repository or record your first commit, tell Git who you are:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

The `--global` flag writes these settings to `~/.gitconfig` in your home directory, making them the default authorship identity for every repository on your system.

To inspect and verify all active configuration settings:

```bash
git config --list
```

> [!TIP]
> Use the same email address associated with your GitHub, GitLab, or Bitbucket account. This ensures your commits are correctly linked to your developer profile when pushed to remote hosts.

---

## Key Takeaways

- **Version control replaces manual file copying** by recording a structured, verifiable timeline of changes across your project.
- **Git is distributed**, meaning your local machine holds a complete, standalone copy of repository history that operates fully offline without a central server.
- **Commits represent immutable snapshots** of your entire project state at a specific point in time, rather than loose collections of file diffs.
- **Authorship configuration is mandatory**: Git requires `user.name` and `user.email` to attribute commits, configured globally via `git config --global`.
- **Settings are stored in `~/.gitconfig`** and can be audited across all configuration scopes at any time using `git config --list`.
