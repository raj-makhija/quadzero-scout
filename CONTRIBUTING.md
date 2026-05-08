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
feature/xxx ──PR──→ develop ──ticket-driven──→ qa ──cherry-pick──→ main
bugfix/xxx  ──PR──→ develop ──ticket-driven──→ qa ──cherry-pick──→ main
hotfix/xxx  ──PR──→ main (back-merge to develop)
```

- `develop`: Active development. All feature/bugfix PRs target this branch.
- `qa`: Staging. Promoted **per-ticket** via the `pipeline:qa-deploy` label or `scripts/qa-deploy.sh <SHA>`. Not auto-merged on a schedule.
- `main`: Production. Per-ticket cherry-pick of `status:qa-approved` tickets at the nightly window (01:00 IST / 19:30 UTC). See `CI-CD.md` §5.7.

## Branch Naming

| Prefix       | Purpose                                  |
|--------------|------------------------------------------|
| `feature/`   | New functionality                        |
| `bugfix/`    | Bug fix                                  |
| `hotfix/`    | Urgent production fix (branch from main) |
| `docs/`      | Documentation changes                    |
| `refactor/`  | Code restructuring                       |

Use lowercase kebab-case: `feature/email-digest`, `bugfix/match-score-null`.

For tickets in this repo, two specific naming patterns apply on top of the prefix table above:

| Pattern                              | Used by                                                  |
|--------------------------------------|----------------------------------------------------------|
| `<type>/ticket-<N>-attempt-<K>`      | Autonomous pipeline (see `CI-CD.md` §2.1)                |
| `<type>/ticket-<N>-cowork`           | Manual / Cowork route (see `docs/two-route-playbook.md`) |

The `-cowork` suffix prevents collision with autonomous attempt branches. For non-ticket scaffolding work, the description-style naming above (`feature/email-digest`) still applies.

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

| Branch   | Stage | Frontend        | Backend                                          |
|----------|-------|-----------------|--------------------------------------------------|
| develop  | dev   | Amplify (auto)  | Manual (`npx serverless deploy --stage dev`)     |
| qa       | qa    | Amplify (auto)  | Label-triggered (`pipeline:qa-deploy`)           |
| main     | prod  | Amplify (auto)  | Nightly cherry-pick (`status:qa-approved` only)  |

Frontend deploys automatically via AWS Amplify on any branch push. Backend deploys to qa via the `pipeline:qa-deploy` label (per ticket) or `scripts/qa-deploy.sh <SHA>`. Backend deploys to prod via the nightly cherry-pick batch in `pipeline-nightly-release.yml`. See `CI-CD.md` §5 for the full promotion model.

## Commit Messages

This repository follows the Conventional Commits standard for all commit messages. Every commit must begin with a type prefix that describes the nature of the change. The five primary types used in this project are `feat` (new feature), `fix` (bug fix), `chore` (maintenance tasks), `docs` (documentation changes), and `refactor` (code restructuring without behaviour change). Using Conventional Commits keeps the history readable and enables automated tooling such as changelogs and release notes. If your commit message does not match the required format, the `commit-msg` hook will reject it.

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
