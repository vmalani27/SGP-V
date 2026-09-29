# Lab 10: A Complete Git Workflow

## What You're Doing and Why

Real development does not use Git commands in isolation. It follows a workflow: create a branch for your task, make commits as you work, keep your branch up to date with main, resolve any conflicts, and merge when the work is complete. This lab puts every skill from the previous nine labs together in a single realistic exercise.

## Scenario

A repository contains a simple web application. You have been asked to add a feature. A colleague is working on the same project and has pushed changes to main while you were working. You need to incorporate their changes before merging your own.

## Objective

Create a feature branch. Make at least three commits. Simulate a colleague pushing to main by committing directly to main from a second terminal or by modifying main before you merge. Update your feature branch with the latest main using merge or rebase. Resolve any conflicts. Merge the feature branch into main. The final state should contain both your work and the simulated colleague's work with a clean history.

## Reflection

This workflow, or a close variation of it, is used at almost every software company in the world. The names may differ — some teams call branches feature branches, others call them topic branches — but the cycle of branch, commit, sync, merge is universal. Mastering it on the command line means you will be comfortable in any Git-based environment, whether that is GitHub, GitLab, Bitbucket, or a self-hosted server.
