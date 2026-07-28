# Chapter 1: Why Version Control Exists

You are working on a project. Everything is going well until you realize the version from yesterday was better than what you have now. You saved over the file. There is no undo.

Or maybe you and a teammate both edited the same file. Neither of you can remember who changed what. One of your changes gets lost.

This is how software was managed before version control. Files were copied into folders like `project_v2`, `project_final`, `project_final_real`. It was messy, error-prone, and impossible to collaborate on.

Version control solves this by tracking every change you make to your project over time. You can go back to any point in your project's history, see who changed what, and work with other people without stepping on each other's toes.

## What Git Actually Does

Git is a **distributed version control system**. That sentence has two important words:

**Version control** means Git tracks changes to files over time. Every time you tell Git to save a snapshot, it records what changed, who changed it, and when. You can recall any snapshot later.

**Distributed** means every developer has a complete copy of the entire project history on their own machine. There is no single point of failure. If the server crashes, every developer's local copy has the full history.

Here is the mental model. Think of Git as a series of snapshots of your project:

```
Snapshot A  -->  Snapshot B  -->  Snapshot C  -->  Snapshot D
(yesterday)     (you fixed     (you added       (teammate
                 a bug)         a feature)       merged)
```

Each snapshot is called a **commit**. You can move between them, compare them, or even combine them.

## Installing Git

Open your terminal and check if Git is already installed:

```
git --version
```

If you see a version number, you are ready to go. If not:

- **Windows**: Download from [git-scm.com](https://git-scm.com/download/win)
- **macOS**: Run `brew install git` or install Xcode Command Line Tools
- **Linux**: Run `sudo apt install git` (Debian/Ubuntu) or `sudo dnf install git` (Fedora)

## Configuring Your Identity

Every commit you make is stamped with your name and email. Before you make your first commit, tell Git who you are:

```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

The `--global` flag means these settings apply to every repository on your machine. Git stores them in a file called `.gitconfig` in your home directory.

To verify the settings were saved:

```
git config --list
```

> **Tip:** Use the same email address you use for GitHub or GitLab. This is how your commits get linked to your account.

> **Try This:** Run `git config --list` and look for `user.name` and `user.email` in the output. If you don't see them, the config commands above didn't work. Check for typos in your terminal.

## Key Takeaways

- Version control tracks changes to files over time so you never lose work
- Git is distributed — every clone has the full history, so there is no single point of failure
- A **commit** is a snapshot of your project at a moment in time
- Always configure your name and email before making your first commit
