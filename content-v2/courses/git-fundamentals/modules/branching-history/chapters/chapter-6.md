# Chapter 6: Fixing Mistakes Without Panic

:::
> **Before this chapter:** You should know the three Git areas — working directory, staging area, and repository — and be comfortable with `git add`, `git commit`, and `git log`.

## Nothing Is Permanent Until You Push

The most important thing to know before this chapter: almost every mistake you can make in Git is reversible, as long as you have not pushed to a shared branch yet. Once you push, other people may have pulled your commit — changing it then rewrites shared history and causes problems for them. Before the push, you are free to fix anything.

This chapter gives you the right tool for each type of mistake, depending on where your changes are.

## The Situation: You Broke the Deployment Config

You are updating a Kubernetes manifest. You accidentally delete a required field, save the file, and stage it. Then you realize the mistake. Which tool do you reach for?

It depends on exactly where you are in the workflow.

---

## Level 1: You Changed a File, Did Not Stage It Yet

You edited `deployment.yaml` and it is now broken. You have not staged it. The last committed version is fine.

```bash
git restore deployment.yaml
```

The file goes back to exactly how it was in the last commit. The change is gone from your working directory — there is no undo for this.

> **Warning:** `git restore` on a working directory file is permanent. The change you discard is gone. If there is any chance you want it back, commit it first (even on a throwaway branch), then restore.

---

## Level 2: You Staged a File, Want to Unstage It

You ran `git add deployment.yaml` and then changed your mind — you want to revise it before committing.

```bash
git restore --staged deployment.yaml
```

The file moves back from the staging area to the working directory. Your changes are still there — you just unstaged them. Nothing is lost.

---

## Level 3: You Just Committed, Want to Fix It

You committed but the message is wrong, or you forgot to include a file, or you committed the wrong version.

**Fix the message:**
```bash
git commit --amend -m "Correct commit message here"
```

**Add a forgotten file:**
```bash
git add forgotten-config.yaml
git commit --amend --no-edit
```

`--no-edit` keeps the original message. The forgotten file gets folded into the commit as if it was always there.

> **Warning:** Only amend commits that have not been pushed. Amending rewrites the commit (it gets a new SHA). If you already pushed it and someone pulled, their history diverges from yours. This causes a painful merge situation. The rule: if it is pushed, use `git revert` instead.

---

## Level 4: You Need to Undo a Pushed Commit

You pushed a commit that broke the CI pipeline and you need to undo it without rewriting history:

```bash
git revert <commit-hash>
```

`git revert` creates a new commit that is the exact inverse of the specified commit — it undoes the change by adding a new commit, not by erasing the old one. History stays intact. Other people who pulled the original commit are not affected.

This is the safe undo for shared branches.

---

## The Reflog: Nothing Is Truly Gone

The reflog is Git's local safety net. It records every position `HEAD` has ever been at — including after resets, branch deletions, and amends.

```bash
git reflog
```

Output:
```
abc1234 HEAD@{0}: commit (amend): Fix deployment config field
def5678 HEAD@{1}: commit: Fix deployment config field
9ab0cde HEAD@{2}: commit: Add initial manifest
```

If you ran `git reset --hard` and thought you lost commits, check the reflog. The old commits are still there, referenced by their SHA.

```bash
git checkout def5678
```

Or to restore a branch to a previous state:
```bash
git reset --hard def5678
```

The reflog is local and expires after 90 days. It does not sync to remote. But within that window it has saved countless engineers from what looked like catastrophic mistakes.

> **In real incidents:** When someone says "I accidentally force-pushed over main and wiped three days of commits" — the first thing you do is check the reflog on any machine that had the commits. They are almost certainly still there.

## The Decision Tree

| Situation | Command |
|---|---|
| Changed a file, not staged, want to discard | `git restore <file>` |
| Staged a file, want to unstage | `git restore --staged <file>` |
| Last commit has wrong message or missing file, not pushed | `git commit --amend` |
| Last commit is wrong, already pushed | `git revert <hash>` |
| Reset and now can't find commits | `git reflog` |

## How Teams Use This

**The accidental secret commit.** Someone commits a `.env` file containing a real database password and pushes to GitHub. The instinct is to delete the file and push again. That does not work — the password is in the history forever, indexed by GitHub and potentially already scraped by bots within seconds. The correct response: rotate the credential immediately (before doing anything else), then use `git filter-repo` or open a GitHub support ticket to purge the history. `git revert` alone is not enough here. GitHub has secret scanning that will alert you when this happens — but rotation is the only real fix.

**Force-push incidents.** `git push --force` on a shared branch is one of the most disruptive things you can do to a team. It rewrites remote history, causing everyone else's `git pull` to fail with a diverged history error. Most companies have branch protection rules that block force-push to `main`. If you need to amend a commit on a feature branch that nobody else has pulled, `--force-with-lease` is the safer option — it refuses to push if the remote has changes you have not fetched.

**The reflog as an on-call tool.** When an engineer says "I just reset --hard and lost a week of commits," the correct immediate response is `git reflog`. The commits are still in the object store for 90 days. You can recover them with `git checkout <sha>` or `git reset --hard <sha>`. This has saved real production work — it is not a theoretical command.

**Code review and revert history.** On teams that require PRs, `git revert` is the standard way to undo a merged change. It creates an auditable record in the commit history: "this was reverted and why." Simply deleting code and committing does the same thing functionally, but loses the connection to the original change. Reviewers and future engineers can trace the decision.

> [!TIP]
> Set up branch protection on your `main` branch on GitHub: require PR reviews, block direct push, and enable secret scanning. These guardrails prevent the entire class of mistakes this chapter teaches you to fix.

## Key Takeaways

- Nothing is permanent until you push — local mistakes are almost always recoverable
- `git restore <file>` discards working directory changes (gone, no undo)
- `git restore --staged <file>` unstages without losing changes
- `git commit --amend` fixes the last commit — only safe before pushing
- `git revert` undoes a pushed commit safely by adding a new commit
- `git reflog` is your ultimate safety net — it remembers every position HEAD has ever been
