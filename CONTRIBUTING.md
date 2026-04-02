# Development Workflow

## Setup

1. Clone the repo and check out `develop`.
2. Run `npm install` at the repo root (installs Husky + commitlint).
3. Run `npm install` in `backend/` and `frontend/` separately.

## Working on a Feature

1. Create an issue in GitHub describing the feature or bug.
2. Create a branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature
   ```
3. Make your changes. Commit using conventional commits:
   ```bash
   git commit -m "feat: add email notification for match results"
   ```
4. Push and open a PR targeting `develop`:
   ```bash
   git push -u origin feature/my-feature
   ```
   Then open a PR on GitHub. Use `Closes #<issue-number>` in the PR description.
5. Wait for CI checks to pass, then merge (squash merge recommended).
6. Delete the branch after merge.

## Branch Strategy

```
feature/xxx ──PR──→ develop ──auto──→ qa ──auto──→ main
bugfix/xxx  ──PR──→ develop ──auto──→ qa ──auto──→ main
hotfix/xxx  ──PR──→ main (back-merge to develop)
```

- `develop`: Active development. All feature/bugfix PRs target this branch.
- `qa`: Staging. Auto-merged from develop daily at 01:00 AM IST (19:30 UTC).
- `main`: Production. Auto-merged from qa daily (same schedule).

## Branch Naming

| Prefix       | Purpose                                  |
|--------------|------------------------------------------|
| `feature/`   | New functionality                        |
| `bugfix/`    | Bug fix                                  |
| `hotfix/`    | Urgent production fix (branch from main) |
| `docs/`      | Documentation changes                    |
| `refactor/`  | Code restructuring                       |

Use lowercase kebab-case: `feature/email-digest`, `bugfix/match-score-null`.

## Pre-commit Checks

Husky runs automatically on every commit:
- **pre-commit**: TypeScript typecheck + ESLint for both backend and frontend.
- **commit-msg**: Validates conventional commit format.

If a check fails, the commit is rejected. Fix the issue and try again.

## CI Pipeline

Every PR to `develop` triggers:
- Lint (backend + frontend)
- Typecheck (backend + frontend)
- Tests (backend + frontend)

All checks must pass before merging.

## Deployment

| Branch   | Stage | Frontend        | Backend               |
|----------|-------|-----------------|-----------------------|
| develop  | dev   | Amplify (auto)  | Manual or CI          |
| qa       | qa    | Amplify (auto)  | Scheduled (daily)     |
| main     | prod  | Amplify (auto)  | Scheduled (daily)     |

Frontend deploys automatically via AWS Amplify on any branch push.
Backend deploys to qa and prod via the scheduled GitHub Actions workflow.

## Commit Types

| Type       | When to use                              |
|------------|------------------------------------------|
| `feat`     | New feature                              |
| `fix`      | Bug fix                                  |
| `docs`     | Documentation only                       |
| `style`    | Formatting, no logic change              |
| `refactor` | Code restructuring, no behavior change   |
| `perf`     | Performance improvement                  |
| `test`     | Adding or updating tests                 |
| `build`    | Build system or dependency changes       |
| `ci`       | CI configuration changes                 |
| `chore`    | Maintenance tasks                        |
| `revert`   | Reverting a previous commit              |
