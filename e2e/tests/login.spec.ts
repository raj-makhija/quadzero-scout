import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test('login flow: valid credentials redirect to recruiter home', async ({ page }) => {
  await login(page);

  // Should not remain on the signin page
  await expect(page).not.toHaveURL(/\/auth\/signin/);

  // Should land on a recruiter page
  await expect(page).toHaveURL(/\/recruiter/);
});
