import { test as base } from '@playwright/test';
import { LoginPage } from './pages/login.page';

/**
 * Shared fixtures. `authedPage` yields a page that has already signed in as
 * the dedicated test user. Each test gets a fresh browser context (Playwright
 * default), so no session/cookie state leaks between specs or runs.
 */
export const test = base.extend<{ authedPage: import('@playwright/test').Page }>({
  authedPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginAsTestUser();
    await use(page);
  },
});

export { expect } from '@playwright/test';
