# Lab 5: Branches

## Scenario

You are working on a shared repository at `~/workspace/team-project` where `main` holds the stable baseline. You need to author project documentation (`docs/setup.md` and `docs/usage.md`) on an isolated feature branch (`feature/add-docs`), verify that `main` remains untouched until the work is ready, and then integrate the completed branch into `main` and remove the obsolete branch reference.

## Objectives

1. Create and switch to `feature/add-docs` in `~/workspace/team-project`.
2. Commit `docs/setup.md` and `docs/usage.md` as separate commits on `feature/add-docs`.
3. Switch back to `main` and confirm branch isolation.
4. Merge `feature/add-docs` into `main` and delete the merged feature branch.
