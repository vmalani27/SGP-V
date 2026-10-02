# Lab 4: Building Clean Commits with git add -p

## Scenario

You are working in the `order-service` repository on `orders.py`. During an editing session, you addressed three distinct issues in the same file:
1. **Validation Bug Fix**: Hardened order quantity validation to reject non-positive quantities (`quantity <= 0`).
2. **Refactor**: Renamed the local discount variable `disc` to `discount_amount` for readability.
3. **Receipt Formatting**: Added explicit currency units (`USD`) to the generated order receipt summary.

All three modifications currently reside in `orders.py` in your working directory. Rather than bundling these unrelated modifications into a single cluttered commit, you will use interactive patch staging (`git add -p`) to create clean, atomic commits for each logical change.

## What You'll Do

- Inspect the uncommitted line changes across `orders.py`
- Selectively stage individual hunks using interactive patch staging
- Verify staged changes before each commit
- Create three distinct, atomic commits for each logical concern
- Push your clean commits to the remote tracking branch (`origin/main`)

## Workflow Guidelines

### 1. Diff Inspection
- Inspect the modifications to identify the distinct changes made across the functions in `orders.py`.

### 2. Interactive Patch Staging
- Review individual hunks interactively.
- Stage only the hunk relevant to your next logical commit while skipping unrelated hunks.
- Verify your staging area to confirm only the intended hunk is prepared for commit.

### 3. Atomic Commits
- Commit each logical concern with a clear, descriptive message explaining the purpose of that specific change.
- Repeat the interactive staging process for subsequent hunks until all changes have been recorded into separate commits.

### 4. Push to Remote
- Synchronize your branch with the remote repository once your working directory is clean.

## Acceptance Criteria Table

| Requirement | Verification Check |
| :--- | :--- |
| Validation bug fix committed | Commit log shows atomic commit for the quantity validation fix |
| Refactor committed separately | Commit log shows separate atomic commit for the discount refactor |
| Formatting update committed | Commit log shows separate commit for the receipt formatting change |
| Clean working directory | Working tree has no unstaged or uncommitted changes |
| Remote is synchronized | Remote tracking branch matches local `HEAD` with all atomic commits |
