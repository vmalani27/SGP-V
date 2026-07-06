# Lab 1: Setting Up Git

## What You're Doing and Why

Before Git can track anything, it needs to know who is making changes. Every commit in Git is stamped with a name and an email address. Without this information, your commit history has no authorship. This lab walks through installing Git, verifying the installation, and configuring your identity so that every commit you make from this machine is correctly attributed to you.

## Background

Git stores its global configuration in a file called `.gitconfig` in your home directory. When you run `git config` with the `--global` flag, you are writing to that file. These settings apply to every repository on your machine. You can also set configuration per-repository by omitting the `--global` flag, which writes to `.git/config` inside that specific project. Global settings act as defaults; local settings override them.

## Command Reference

### `git --version`

Prints the installed Git version. Use this to confirm the installation succeeded.

### `git config --global user.name "Your Name"`

Sets the name that will appear on every commit you create.

### `git config --global user.email "you@example.com"`

Sets the email address attached to every commit you create.

### `git config --list`

Displays all active configuration settings across global and local scopes.

## Scenario

You have just installed Git on a new machine. Before you can commit anything, you need to configure your identity. Set your name and email, then confirm the configuration was saved correctly.

## Objective

Configure Git with your name and email address. Verify that the configuration was saved by listing all active settings.

## Reflection

Open the `.gitconfig` file in your home directory and look at its contents. Notice that it is a plain text file. Every `git config` command you ran simply wrote key-value pairs into this file. Consider what would happen if you set a local configuration inside a repository that conflicts with your global setting. Which would Git use?
