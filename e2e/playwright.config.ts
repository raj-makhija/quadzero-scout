import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the post-deploy E2E smoke suite.
 *
 * Targets the dev environment (dev.scout.quadzero.com) by default; override
 * with E2E_BASE_URL for local debugging against a different stage.
 *
 * Design constraints (ticket #152):
 *  - Headless Chromium only -- keeps the GitHub Actions job light and the
 *    whole run under the 3-minute budget.
 *  - workers: 1 -- the suite shares a single dedicated test user, so running
 *    specs serially avoids screening-lock contention on the same candidate.
 *  - No `maxFailures` / no `--bail` -- a single failing test must NOT stop the
 *    rest; the report needs to list every failure, not just the first.
 *  - Fresh browser context per test (Playwright default) -- no cookie or
 *    localStorage leakage between specs or between runs.
 *  - retries: 0 -- this is a smoke gate, not a flake-suppressor; a failure
 *    should surface, not be silently retried away.
 */
export default defineConfig({
  testDir: './tests',
  // Hard ceiling so a hung run cannot blow the 3-minute Actions budget.
  globalTimeout: 150_000,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/results.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://dev.scout.quadzero.com',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
