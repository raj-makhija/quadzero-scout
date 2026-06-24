import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('candidate search: search page loads with JD input', async ({ page }) => {
  await page.goto('/recruiter/search');

  // The JD input textarea must be visible — verifies the search page renders
  const jdInput = page.locator('textarea').first();
  await expect(jdInput).toBeVisible({ timeout: 10000 });
});

test('candidate search: locate page shows profile results', async ({ page }) => {
  await page.goto('/recruiter/locate');

  // Type a common skill and wait for name-search suggestions or profile cards
  const searchInput = page.locator('input[placeholder*="name" i], input[placeholder*="search" i]').first();
  if (await searchInput.isVisible()) {
    await searchInput.fill('python');
    // Give the search a moment to return results
    await page.waitForTimeout(2000);
  }

  // At least one profile card link to a candidate profile must be visible
  const profileLink = page.locator('a[href*="/recruiter/locate/"]').first();
  await expect(profileLink).toBeVisible({ timeout: 15000 });
});
