# Lab 4: Building Clean Commits

## Scenario

You are working in `/home/student/order-service` on `orders.py`. During an editing session, you addressed three distinct concerns in the same file:
1. **Validation Bug Fix**: Updated order quantity validation to reject non-positive quantities (`quantity <= 0`).
2. **Refactor**: Renamed the local discount variable `disc` to `discount_amount` for readability.
3. **Receipt Formatting**: Added explicit currency units (`USD`) to the generated order receipt summary.

All three modifications are currently unstaged in `orders.py`. Rather than bundling unrelated modifications into a single commit, your goal is to split them into three separate, atomic commits and push them to `origin/main`.

## Objectives

- Inspect uncommitted modifications within a single file
- Stage individual hunks selectively
- Create three separate atomic commits, one for each logical change
- Push the resulting commit history to `origin/main`

## Acceptance Criteria

| Requirement | Expected Outcome |
| :--- | :--- |
| Validation bug fix committed | Recorded in its own dedicated commit |
| Refactor committed separately | Recorded in a separate commit from the bug fix and formatting update |
| Formatting update committed | Recorded in the third atomic commit |
| Clean working directory | Working tree has no unstaged or uncommitted changes |
| Remote synchronized | `origin/main` matches local `HEAD` with all four commits |
