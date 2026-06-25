# E2E smoke tests

Browser-based Playwright smoke tests that run against the deployed **dev**
environment (`dev.scout.quadzero.com`) after a ticket is merged to `develop`.
They are a final post-deploy validation step — **not** part of the pre-merge
`validate` gate, since the code is only on dev once it has been merged and
deployed.

## What is covered

| Spec | Flow |
|------|------|
| `tests/login.spec.ts` | Dedicated test user signs in with credentials |
| `tests/search.spec.ts` | Recruiter searches for candidates by job description |
| `tests/screening.spec.ts` | Open screening modal, toggle "still on job", save, reopen, verify pre-fill |

## Credentials

Tests sign in as a dedicated, pre-approved recruiter user
(`e2e-tester@quadzero.com`) that must exist in the **dev** Users table.
Credentials are read **only** from environment variables, sourced from repo
secrets in CI:

- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`

They are never hard-coded in any test, page object, config, or script.

## Running locally

```bash
cd e2e
npm install
npm run install:browser        # downloads headless Chromium
E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npm test
# Override the target environment if needed:
E2E_BASE_URL=https://qa.scout.quadzero.com ... npm test
```

## How it runs in the pipeline

`scripts/dummy-tester.sh <ticket> e2e` installs the suite, runs Playwright
against dev, and posts a structured `[tester:e2e-report]` PASS/FAIL comment on
the ticket. It is **fire-and-report**: a FAIL posts the report but does not
change any pipeline state (`merged-to-develop` stays terminal; no rework, no QA
lock). The `.github/workflows/playwright.yml` job wires this to fire
automatically after `pipeline:qa-approve` merges the ticket to `develop`.

## Conventions

- Headless Chromium only; whole run is kept under 3 minutes.
- `workers: 1` — the suite shares one test user, so specs run serially to avoid
  screening-lock contention.
- No `--bail` / `maxFailures` — every test runs even if one fails, so the report
  lists all failures.
- Fresh browser context per test — no cookie/localStorage leakage between specs
  or runs.
